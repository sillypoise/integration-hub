import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { ClientBase } from "pg";
import { PgBoss } from "pg-boss";

import {
    p1_synchronization_job_schema,
    type P1SynchronizationJob,
} from "../contracts/synchronization_contracts.ts";

export const p1_synchronization_queue_name = "p1_synchronization";
export const p1_synchronization_queue_options = Object.freeze({
    deleteAfterSeconds: 86_400,
    expireInSeconds: 30,
    notify: false,
    partition: false,
    policy: "standard" as const,
    retentionSeconds: 86_400,
    retryBackoff: false,
    retryDelay: 2,
    retryLimit: 2,
    warningQueueSize: 1_000,
});

export async function enqueue_p1_synchronization(
    database_client: ClientBase,
    input: P1SynchronizationJob,
): Promise<void> {
    const payload = p1_synchronization_job_schema.parse(input);
    assert.equal(payload.p1_run_id.length, 36);
    assert.equal(payload.p1_workspace_id.length, 36);

    // An unstarted producer uses only the caller's transaction, not a cross-bundle singleton.
    // The application startup owns schema migration and queue creation before accepting HTTP.
    const producer = new PgBoss({
        db: { executeSql: (text, values) => database_client.query(text, values) },
        schema: "p1_job",
    });
    const job_id = await producer.send(p1_synchronization_queue_name, payload, {
        ...p1_synchronization_queue_options,
        id: payload.p1_run_id,
        singletonKey: payload.p1_run_id,
    });
    assert.equal(job_id, payload.p1_run_id);
}

export async function enqueue_p1_recovery(
    database_client: ClientBase,
    input: P1SynchronizationJob,
    start_after: Date,
): Promise<void> {
    const payload = p1_synchronization_job_schema.parse(input);
    assert.ok(Number.isFinite(start_after.getTime()));
    assert.equal(payload.p1_run_id.length, 36);
    const job_id = randomUUID();
    const producer = new PgBoss({
        db: { executeSql: (text, values) => database_client.query(text, values) },
        schema: "p1_job",
    });
    const accepted = await producer.send(p1_synchronization_queue_name, payload, {
        ...p1_synchronization_queue_options,
        id: job_id,
        singletonKey: job_id,
        startAfter: start_after,
    });
    assert.equal(accepted, job_id);
    const result = await database_client.query(
        `UPDATE p1_synchronization_runs SET p1_delivery_job_id = $1
         WHERE p1_id = $2 AND p1_workspace_id = $3`,
        [job_id, payload.p1_run_id, payload.p1_workspace_id],
    );
    assert.equal(result.rowCount, 1);
}

export async function cancel_p1_workspace_jobs(
    database_client: ClientBase,
    job_ids: string[],
): Promise<void> {
    assert.ok(job_ids.length <= 1_000);
    assert.ok(job_ids.every((id) => id.length === 36));
    const producer = new PgBoss({
        db: { executeSql: (text, values) => database_client.query(text, values) },
        schema: "p1_job",
    });
    // Use the vendor API on the reset transaction; never edit vendor rows directly.
    await producer.cancel(p1_synchronization_queue_name, job_ids);
}
