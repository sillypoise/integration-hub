import assert from "node:assert/strict";
import type { ClientBase } from "pg";

// These two persistent rows cap accepted work across restarts and application replicas.
export async function consume_p1_demo_budget(
    database_client: ClientBase,
    resource: "events" | "workspaces",
): Promise<boolean> {
    assert.ok(resource === "events" || resource === "workspaces");
    const limit = resource === "events" ? 2_000 : 200;
    assert.ok(limit >= 200);
    const result = await database_client.query(
        `UPDATE p1_demo_budgets SET
            p1_count = CASE WHEN p1_window_started_at <= clock_timestamp() - interval '24 hours'
                THEN 1 ELSE p1_count + 1 END,
            p1_window_started_at = CASE
                WHEN p1_window_started_at <= clock_timestamp() - interval '24 hours'
                THEN clock_timestamp() ELSE p1_window_started_at END
         WHERE p1_resource = $1 AND (p1_count < $2
             OR p1_window_started_at <= clock_timestamp() - interval '24 hours')`,
        [resource, limit],
    );
    assert.ok(result.rowCount === 0 || result.rowCount === 1);
    return result.rowCount === 1;
}
