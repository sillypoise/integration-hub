import assert from "node:assert/strict";
import type { ClientBase } from "pg";
import { z } from "zod";
import { with_database_client } from "../database/database_client.ts";
import { cancel_p1_workspace_jobs, enqueue_p1_recovery } from "../jobs/synchronization_queue.ts";

export type P1RecoveryAction =
    | { action: "retry"; p1_run_id: string }
    | { action: "reset"; p1_request_id: string };
export type P1RecoveryCode =
    | "RETRY_ACCEPTED"
    | "WORKSPACE_RESET"
    | "WORKSPACE_UNAUTHORIZED"
    | "RESOURCE_NOT_FOUND"
    | "RETRY_NOT_ALLOWED"
    | "RESET_LIMIT_REACHED";

export async function mutate_p1_recovery(
    p1_workspace_id: string,
    action: P1RecoveryAction,
): Promise<P1RecoveryCode> {
    z.uuid().parse(p1_workspace_id);
    z.uuid().parse(action.action === "retry" ? action.p1_run_id : action.p1_request_id);
    assert.equal(p1_workspace_id.length, 36);
    assert.ok(action.action === "retry" || action.action === "reset");
    return with_database_client(async (database_client) => {
        await database_client.query("BEGIN");
        try {
            // Same first lock as intake and worker: resets cannot race effects or resurrect runs.
            const workspace = await database_client.query(
                `SELECT p1_id FROM p1_demo_workspaces
                 WHERE p1_id = $1 AND p1_expires_at > clock_timestamp() FOR UPDATE`,
                [p1_workspace_id],
            );
            if (workspace.rowCount === 0) {
                await database_client.query("ROLLBACK");
                return "WORKSPACE_UNAUTHORIZED";
            }
            const result =
                action.action === "retry"
                    ? await mutate_p1_recovery_retry(
                          database_client,
                          p1_workspace_id,
                          action.p1_run_id,
                      )
                    : await mutate_p1_recovery_reset(
                          database_client,
                          p1_workspace_id,
                          action.p1_request_id,
                      );
            await database_client.query("COMMIT");
            return result;
        } catch (error: unknown) {
            await database_client.query("ROLLBACK");
            throw error;
        }
    });
}

async function mutate_p1_recovery_retry(
    database_client: ClientBase,
    p1_workspace_id: string,
    p1_run_id: string,
): Promise<P1RecoveryCode> {
    assert.equal(p1_workspace_id.length, 36);
    assert.equal(p1_run_id.length, 36);
    const result = await database_client.query<{
        p1_source_event_id: string;
        p1_allowed: boolean;
    }>(
        `SELECT p1_source_event_id,
            (p1_manual_retry_count = 0 AND p1_attempt_count <= 3 AND
                (p1_state = 'terminal_failure' OR
                    (p1_state IN ('queued', 'retryable_failure') AND
                        p1_job.state IN ('failed', 'cancelled')))) IS TRUE AS p1_allowed
         FROM p1_synchronization_runs AS p1_run
         LEFT JOIN p1_job.job AS p1_job
            ON p1_job.id = COALESCE(p1_run.p1_delivery_job_id, p1_run.p1_id)
            AND p1_job.name = 'p1_synchronization'
         WHERE p1_run.p1_id = $1 AND p1_workspace_id = $2 FOR UPDATE OF p1_run`,
        [p1_run_id, p1_workspace_id],
    );
    const run = result.rows[0];
    if (run === undefined) return "RESOURCE_NOT_FOUND";
    if (!run.p1_allowed) return "RETRY_NOT_ALLOWED";
    const updated = await database_client.query(
        `UPDATE p1_synchronization_runs SET p1_manual_retry_count = 1, p1_state = 'queued',
            p1_error_code = NULL, p1_next_attempt_at = NULL, p1_completed_at = NULL,
            p1_updated_at = clock_timestamp() WHERE p1_id = $1 AND p1_workspace_id = $2`,
        [p1_run_id, p1_workspace_id],
    );
    assert.equal(updated.rowCount, 1);
    await enqueue_p1_recovery(
        database_client,
        {
            p1_run_id,
            p1_workspace_id,
            p1_source_event_id: run.p1_source_event_id,
            p1_correlation_id: p1_run_id,
        },
        new Date(),
    );
    await database_client.query(
        `INSERT INTO p1_audit_events (p1_workspace_id, p1_action, p1_resource_type, p1_resource_id)
         VALUES ($1, 'retry_requested', 'synchronization_run', $2)`,
        [p1_workspace_id, p1_run_id],
    );
    return "RETRY_ACCEPTED";
}

async function mutate_p1_recovery_reset(
    database_client: ClientBase,
    p1_workspace_id: string,
    p1_request_id: string,
): Promise<P1RecoveryCode> {
    assert.equal(p1_workspace_id.length, 36);
    assert.equal(p1_request_id.length, 36);
    const audits = await database_client.query<{ p1_request_id: string }>(
        `SELECT p1_request_id FROM p1_audit_events
         WHERE p1_workspace_id = $1 AND p1_action = 'workspace_reset' LIMIT 3`,
        [p1_workspace_id],
    );
    // A lost response can be retried without deleting events accepted after the first reset.
    if (audits.rows.some((audit) => audit.p1_request_id === p1_request_id))
        return "WORKSPACE_RESET";
    if (audits.rows.length === 3) return "RESET_LIMIT_REACHED";
    const jobs = await database_client.query<{ p1_job_id: string }>(
        `SELECT COALESCE(p1_delivery_job_id, p1_id) AS p1_job_id
         FROM p1_synchronization_runs WHERE p1_workspace_id = $1 LIMIT 1000`,
        [p1_workspace_id],
    );
    if (jobs.rows.length > 0) {
        await cancel_p1_workspace_jobs(
            database_client,
            jobs.rows.map((job) => job.p1_job_id),
        );
    }
    await database_client.query("DELETE FROM p1_source_events WHERE p1_workspace_id = $1", [
        p1_workspace_id,
    ]);
    await database_client.query(
        "DELETE FROM p1_simulated_crm_customers WHERE p1_workspace_id = $1",
        [p1_workspace_id],
    );
    await database_client.query(
        `INSERT INTO p1_audit_events
            (p1_workspace_id, p1_action, p1_resource_type, p1_resource_id, p1_request_id)
         VALUES ($1, 'workspace_reset', 'workspace', $1, $2)`,
        [p1_workspace_id, p1_request_id],
    );
    return "WORKSPACE_RESET";
}
