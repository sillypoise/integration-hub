import assert from "node:assert/strict";
import type { ClientBase } from "pg";

import {
    p1_synchronization_job_schema,
    type P1SynchronizationJob,
} from "../contracts/synchronization_contracts.ts";
import { with_database_client } from "../database/database_client.ts";
import { upsert_p1_simulated_crm_customer } from "../simulators/crm_simulator.ts";
import { map_p1_customer_event } from "./customer_mapping.ts";

export async function process_p1_synchronization(input: unknown): Promise<"succeeded" | "ignored"> {
    const job = p1_synchronization_job_schema.parse(input);
    assert.equal(job.p1_run_id.length, 36);
    assert.equal(job.p1_source_event_id.length, 36);

    return with_database_client(async (database_client) => {
        await database_client.query("BEGIN");
        try {
            const source = await process_p1_synchronization_lock_source(database_client, job);
            if (source === null) {
                await database_client.query("ROLLBACK");
                return "ignored";
            }
            const customer = map_p1_customer_event(source);
            await process_p1_synchronization_start_attempt(database_client, job);
            await upsert_p1_simulated_crm_customer(database_client, { job, customer });
            await process_p1_synchronization_finish_attempt(database_client, job);
            await database_client.query("COMMIT");
            return "succeeded";
        } catch (error: unknown) {
            await database_client.query("ROLLBACK");
            throw error;
        }
    });
}

async function process_p1_synchronization_lock_source(
    database_client: ClientBase,
    job: P1SynchronizationJob,
): Promise<unknown> {
    assert.equal(job.p1_workspace_id.length, 36);
    assert.equal(job.p1_run_id.length, 36);
    const workspace = await database_client.query(
        `SELECT p1_id FROM p1_demo_workspaces
         WHERE p1_id = $1 AND p1_expires_at > clock_timestamp() FOR UPDATE`,
        [job.p1_workspace_id],
    );
    if (workspace.rowCount === 0) return null;
    const result = await database_client.query<{ p1_payload: unknown }>(
        `SELECT p1_event.p1_payload FROM p1_synchronization_runs AS p1_run
         JOIN p1_source_events AS p1_event
           ON p1_event.p1_id = p1_run.p1_source_event_id
          AND p1_event.p1_workspace_id = p1_run.p1_workspace_id
         WHERE p1_run.p1_id = $1 AND p1_run.p1_workspace_id = $2
           AND p1_run.p1_source_event_id = $3 AND p1_run.p1_state = 'queued'
           AND p1_run.p1_attempt_count < 3 FOR UPDATE OF p1_run`,
        [job.p1_run_id, job.p1_workspace_id, job.p1_source_event_id],
    );
    assert.ok(result.rowCount === 0 || result.rowCount === 1);
    return result.rows[0]?.p1_payload ?? null;
}

async function process_p1_synchronization_start_attempt(
    database_client: ClientBase,
    job: P1SynchronizationJob,
): Promise<void> {
    assert.equal(job.p1_workspace_id.length, 36);
    assert.equal(job.p1_run_id.length, 36);
    const result = await database_client.query(
        `WITH p1_run AS (
            UPDATE p1_synchronization_runs
            SET p1_state = 'processing', p1_attempt_count = p1_attempt_count + 1,
                p1_updated_at = clock_timestamp(), p1_next_attempt_at = NULL
            WHERE p1_id = $1 AND p1_workspace_id = $2 AND p1_state = 'queued'
              AND p1_attempt_count < 3
            RETURNING p1_attempt_count
        )
        INSERT INTO p1_synchronization_attempts
            (p1_workspace_id, p1_run_id, p1_attempt_number, p1_state)
        SELECT $2, $1, p1_attempt_count, 'processing' FROM p1_run`,
        [job.p1_run_id, job.p1_workspace_id],
    );
    assert.equal(result.rowCount, 1);
}

async function process_p1_synchronization_finish_attempt(
    database_client: ClientBase,
    job: P1SynchronizationJob,
): Promise<void> {
    assert.equal(job.p1_workspace_id.length, 36);
    assert.equal(job.p1_run_id.length, 36);
    const result = await database_client.query(
        `WITH p1_run AS (
            UPDATE p1_synchronization_runs SET p1_state = 'succeeded',
                p1_completed_at = clock_timestamp(), p1_updated_at = clock_timestamp()
            WHERE p1_id = $1 AND p1_workspace_id = $2 AND p1_state = 'processing'
            RETURNING p1_attempt_count
        )
        UPDATE p1_synchronization_attempts SET p1_state = 'succeeded',
            p1_completed_at = clock_timestamp()
        WHERE p1_run_id = $1 AND p1_workspace_id = $2
          AND p1_attempt_number = (SELECT p1_attempt_count FROM p1_run)
          AND p1_state = 'processing'`,
        [job.p1_run_id, job.p1_workspace_id],
    );
    assert.equal(result.rowCount, 1);
}
