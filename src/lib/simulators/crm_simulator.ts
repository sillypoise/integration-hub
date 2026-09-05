import assert from "node:assert/strict";
import type { ClientBase } from "pg";

import {
    p1_mapped_customer_schema,
    p1_synchronization_job_schema,
    type P1SynchronizationJob,
} from "../contracts/synchronization_contracts.ts";

export async function upsert_p1_simulated_crm_customer(
    database_client: ClientBase,
    options: Readonly<{ job: P1SynchronizationJob; customer: unknown }>,
): Promise<boolean> {
    const job = p1_synchronization_job_schema.parse(options.job);
    const customer = p1_mapped_customer_schema.parse(options.customer);
    assert.ok(customer.p1_external_id.length > 0);
    assert.equal(job.p1_run_id.length, 36);

    // The effect ledger and upsert are one statement in the worker transaction. Replayed
    // keys cannot overwrite a newer customer, even when the caller retries after an ACK loss.
    const result = await database_client.query(
        `WITH p1_effect AS (
            INSERT INTO p1_simulated_crm_effects (p1_run_id, p1_workspace_id, p1_payload)
            VALUES ($1, $2, $3)
            ON CONFLICT (p1_run_id) DO NOTHING
            RETURNING p1_run_id
        ), p1_customer AS (
            INSERT INTO p1_simulated_crm_customers
                (p1_workspace_id, p1_external_id, p1_payload)
            SELECT $2, $4, $3 FROM p1_effect
            ON CONFLICT (p1_workspace_id, p1_external_id) DO UPDATE
                SET p1_payload = EXCLUDED.p1_payload
                WHERE (p1_simulated_crm_customers.p1_payload->>'p1_source_updated_at')::timestamptz
                    < (EXCLUDED.p1_payload->>'p1_source_updated_at')::timestamptz
        )
        SELECT p1_run_id FROM p1_effect`,
        [job.p1_run_id, job.p1_workspace_id, customer, customer.p1_external_id],
    );
    assert.ok(result.rowCount === 0 || result.rowCount === 1);
    return result.rowCount === 1;
}
