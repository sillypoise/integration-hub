import assert from "node:assert/strict";
import { z } from "zod";

import { with_database_client } from "../database/database_client.ts";
import type { P1RunState } from "../contracts/synchronization_contracts.ts";

export type P1RunSummary = Readonly<{
    p1_run_id: string;
    p1_source_event_id: string;
    p1_state: P1RunState;
    p1_delivery_state: string | null;
    p1_attempt_count: number;
    p1_created_at: Date;
    p1_completed_at: Date | null;
}>;

export async function list_p1_synchronization_runs(
    options: Readonly<{
        p1_workspace_id: string;
        p1_page: number;
    }>,
): Promise<ReadonlyArray<P1RunSummary>> {
    z.uuid().parse(options.p1_workspace_id);
    z.number().int().min(1).max(50).parse(options.p1_page);
    assert.ok(options.p1_page >= 1);
    assert.ok(options.p1_page <= 50);
    return with_database_client(async (database_client) => {
        const result = await database_client.query<P1RunSummary>(
            `SELECT p1_run.p1_id AS p1_run_id, p1_run.p1_source_event_id,
                p1_run.p1_state, p1_job.state AS p1_delivery_state, p1_run.p1_attempt_count,
                p1_run.p1_created_at, p1_run.p1_completed_at
             FROM p1_synchronization_runs AS p1_run
             JOIN p1_demo_workspaces AS p1_workspace ON p1_workspace.p1_id = p1_run.p1_workspace_id
             LEFT JOIN p1_job.job AS p1_job ON p1_job.id = p1_run.p1_id
                 AND p1_job.name = 'p1_synchronization'
             WHERE p1_workspace.p1_id = $1 AND p1_workspace.p1_expires_at > clock_timestamp()
             ORDER BY p1_run.p1_created_at DESC, p1_run.p1_id DESC LIMIT 20 OFFSET $2`,
            [options.p1_workspace_id, (options.p1_page - 1) * 20],
        );
        assert.ok(result.rows.length <= 20);
        return result.rows;
    });
}

export async function read_p1_synchronization_detail(
    options: Readonly<{
        p1_workspace_id: string;
        p1_run_id: string;
    }>,
): Promise<Record<string, unknown> | null> {
    z.uuid().parse(options.p1_workspace_id);
    z.uuid().parse(options.p1_run_id);
    assert.equal(options.p1_workspace_id.length, 36);
    assert.equal(options.p1_run_id.length, 36);
    return with_database_client(async (database_client) => {
        const result = await database_client.query<Record<string, unknown>>(
            `SELECT p1_run.p1_id AS p1_run_id, p1_run.p1_id AS p1_correlation_id,
                p1_run.p1_state, p1_job.state AS p1_delivery_state,
                p1_run.p1_attempt_count, p1_run.p1_created_at,
                p1_run.p1_completed_at, p1_run.p1_next_attempt_at,
                p1_event.p1_id AS p1_source_event_id,
                jsonb_build_object(
                    'p1_event_type', p1_event.p1_event_type,
                    'p1_external_id', p1_event.p1_payload->'p1_customer'->'p1_external_id',
                    'p1_updated_at', p1_event.p1_payload->'p1_customer'->'p1_updated_at'
                ) AS p1_source,
                (SELECT p1_payload FROM p1_simulated_crm_effects
                 WHERE p1_run_id = p1_run.p1_id AND p1_workspace_id = $1) AS p1_destination,
                (SELECT COALESCE(jsonb_agg(p1_attempt ORDER BY p1_attempt_number), '[]'::jsonb)
                 FROM (SELECT p1_attempt_number, p1_state, p1_error_code,
                     p1_started_at, p1_completed_at FROM p1_synchronization_attempts
                     WHERE p1_run_id = p1_run.p1_id AND p1_workspace_id = $1
                     ORDER BY p1_attempt_number LIMIT 3) AS p1_attempt) AS p1_attempts
             FROM p1_synchronization_runs AS p1_run
             JOIN p1_demo_workspaces AS p1_workspace ON p1_workspace.p1_id = p1_run.p1_workspace_id
             JOIN p1_source_events AS p1_event ON p1_event.p1_id = p1_run.p1_source_event_id
                 AND p1_event.p1_workspace_id = p1_run.p1_workspace_id
             LEFT JOIN p1_job.job AS p1_job ON p1_job.id = p1_run.p1_id
                 AND p1_job.name = 'p1_synchronization'
             WHERE p1_workspace.p1_id = $1 AND p1_run.p1_id = $2
                 AND p1_workspace.p1_expires_at > clock_timestamp() LIMIT 1`,
            [options.p1_workspace_id, options.p1_run_id],
        );
        assert.ok(result.rows.length <= 1);
        return result.rows[0] ?? null;
    });
}
