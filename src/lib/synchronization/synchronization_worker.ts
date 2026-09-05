import assert from "node:assert/strict";
import type { ClientBase } from "pg";
import type { P1Scenario } from "../contracts/recovery.ts";
import { simulate_p1_destination_failure } from "../simulators/failure_simulator.ts";
import { enqueue_p1_recovery } from "../jobs/synchronization_queue.ts";

import {
    p1_synchronization_job_schema,
    type P1SynchronizationJob,
} from "../contracts/synchronization_contracts.ts";
import { with_database_client } from "../database/database_client.ts";
import { upsert_p1_simulated_crm_customer } from "../simulators/crm_simulator.ts";
import { map_p1_customer_event } from "./customer_mapping.ts";

export async function process_p1_synchronization(
    input: unknown,
): Promise<"succeeded" | "ignored" | "retryable_failure" | "terminal_failure"> {
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
            const customer = map_p1_customer_event(source.p1_payload);
            const failure = simulate_p1_destination_failure({
                ...source,
                p1_attempt_number: source.p1_attempt_count + 1,
            });
            await process_p1_synchronization_start_attempt(database_client, job);
            if (failure !== null) {
                const outcome = await process_p1_synchronization_record_failure(database_client, {
                    job,
                    failure,
                    attempt_number: source.p1_attempt_count + 1,
                });
                await database_client.query("COMMIT");
                return outcome;
            }
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

async function process_p1_synchronization_record_failure(
    database_client: ClientBase,
    options: Readonly<{
        job: P1SynchronizationJob;
        failure: string;
        attempt_number: number;
    }>,
): Promise<"retryable_failure" | "terminal_failure"> {
    assert.ok(options.attempt_number >= 1);
    assert.ok(options.attempt_number <= 3);
    const terminal = options.failure === "SIMULATED_INVALID_DESTINATION";
    const exhausted = options.attempt_number === 3;
    const state = terminal || exhausted ? "terminal_failure" : "retryable_failure";
    // Two durable delays, 5 then 10 seconds, keep the operational demonstration visible.
    const next_attempt_at =
        state === "retryable_failure"
            ? new Date(Date.now() + options.attempt_number * 5_000)
            : null;
    const error_code = exhausted ? "RETRY_EXHAUSTED" : options.failure;
    const { job } = options;
    const result = await database_client.query(
        `WITH p1_run AS (
            UPDATE p1_synchronization_runs SET p1_state = $3, p1_error_code = $4,
                p1_next_attempt_at = $5, p1_updated_at = clock_timestamp(),
                p1_completed_at = CASE WHEN $3::varchar = 'terminal_failure' THEN clock_timestamp() END
            WHERE p1_id = $1 AND p1_workspace_id = $2 AND p1_state = 'processing'
            RETURNING p1_attempt_count
        ) UPDATE p1_synchronization_attempts SET p1_state = $3, p1_error_code = $6,
            p1_completed_at = clock_timestamp()
        WHERE p1_run_id = $1 AND p1_workspace_id = $2
            AND p1_attempt_number = (SELECT p1_attempt_count FROM p1_run)`,
        [job.p1_run_id, job.p1_workspace_id, state, error_code, next_attempt_at, options.failure],
    );
    assert.equal(result.rowCount, 1);
    if (next_attempt_at !== null) {
        await enqueue_p1_recovery(database_client, job, next_attempt_at);
    }
    return state;
}

async function process_p1_synchronization_lock_source(
    database_client: ClientBase,
    job: P1SynchronizationJob,
): Promise<{
    p1_payload: unknown;
    p1_scenario: P1Scenario;
    p1_attempt_count: number;
    p1_manual_retry_count: number;
} | null> {
    assert.equal(job.p1_workspace_id.length, 36);
    assert.equal(job.p1_run_id.length, 36);
    const workspace = await database_client.query(
        `SELECT p1_id FROM p1_demo_workspaces
         WHERE p1_id = $1 AND p1_expires_at > clock_timestamp() FOR UPDATE`,
        [job.p1_workspace_id],
    );
    if (workspace.rowCount === 0) return null;
    const result = await database_client.query<{
        p1_payload: unknown;
        p1_scenario: P1Scenario;
        p1_attempt_count: number;
        p1_manual_retry_count: number;
    }>(
        `SELECT p1_event.p1_payload, p1_run.p1_scenario, p1_run.p1_attempt_count,
            p1_run.p1_manual_retry_count FROM p1_synchronization_runs AS p1_run
         JOIN p1_source_events AS p1_event
           ON p1_event.p1_id = p1_run.p1_source_event_id
          AND p1_event.p1_workspace_id = p1_run.p1_workspace_id
         WHERE p1_run.p1_id = $1 AND p1_run.p1_workspace_id = $2
           AND p1_run.p1_source_event_id = $3
           AND p1_run.p1_state IN ('queued', 'retryable_failure')
           AND (p1_run.p1_next_attempt_at IS NULL
                OR p1_run.p1_next_attempt_at <= clock_timestamp())
           AND p1_run.p1_attempt_count < 3 + p1_run.p1_manual_retry_count FOR UPDATE OF p1_run`,
        [job.p1_run_id, job.p1_workspace_id, job.p1_source_event_id],
    );
    assert.ok(result.rowCount === 0 || result.rowCount === 1);
    return result.rows[0] ?? null;
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
            WHERE p1_id = $1 AND p1_workspace_id = $2
              AND p1_state IN ('queued', 'retryable_failure')
              AND p1_attempt_count < 3 + p1_manual_retry_count
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
            UPDATE p1_synchronization_runs SET p1_state = 'succeeded', p1_error_code = NULL,
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
