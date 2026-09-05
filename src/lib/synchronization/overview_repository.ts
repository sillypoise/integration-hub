import assert from "node:assert/strict";
import { z } from "zod";
import { with_database_client } from "../database/database_client.ts";

export async function read_p1_overview(p1_workspace_id: string) {
    z.uuid().parse(p1_workspace_id);
    assert.equal(p1_workspace_id.length, 36);
    return with_database_client(async (database_client) => {
        const result = await database_client.query<Record<string, unknown>>(
            `WITH p1_runs AS (
                SELECT p1_run.p1_id AS p1_run_id, p1_source_event_id, p1_state,
                    p1_job.state AS p1_delivery_state, p1_attempt_count,
                    p1_run.p1_created_at, p1_completed_at,
                    CASE WHEN p1_state = 'succeeded' THEN 'succeeded'
                         WHEN p1_state IN ('terminal_failure', 'retryable_failure')
                           OR p1_job.state IN ('failed', 'cancelled') THEN 'attention'
                         ELSE 'pending' END AS p1_category
                FROM p1_synchronization_runs AS p1_run
                JOIN p1_demo_workspaces AS p1_workspace
                    ON p1_workspace.p1_id = p1_run.p1_workspace_id
                LEFT JOIN p1_job.job AS p1_job
                    ON p1_job.id = p1_run.p1_id AND p1_job.name = 'p1_synchronization'
                WHERE p1_workspace.p1_id = $1 AND p1_expires_at > clock_timestamp()
                ORDER BY p1_run.p1_created_at DESC, p1_run.p1_id DESC LIMIT 1000
            ) SELECT count(*)::int AS p1_total,
                count(*) FILTER (WHERE p1_category = 'succeeded')::int AS p1_succeeded,
                count(*) FILTER (WHERE p1_category = 'pending')::int AS p1_pending,
                count(*) FILTER (WHERE p1_category = 'attention')::int AS p1_attention,
                (SELECT COALESCE(jsonb_agg(p1_recent), '[]'::jsonb)
                    FROM (SELECT * FROM p1_runs ORDER BY p1_created_at DESC, p1_run_id DESC
                          LIMIT 6) AS p1_recent) AS p1_recent
                FROM p1_runs`,
            [p1_workspace_id],
        );
        assert.equal(result.rowCount, 1);
        assert.ok(result.rows[0]);
        return result.rows[0];
    });
}
