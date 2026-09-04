import { describe, expect, it } from "vitest";

import { with_database_client } from "../lib/database/database_client.ts";
import { create_p1_demo_workspace } from "../lib/workspaces/workspace_repository.ts";

const current_time = new Date("2026-09-04T22:00:00.000Z");

describe("p1 domain schema ownership", () => {
    // This migration check proves project-owned objects retain visible ownership.
    it("prefixes every project-owned table, column, index, and constraint", async () => {
        const names = await with_database_client(async (database_client) => {
            const result = await database_client.query<{
                p1_kind: string;
                p1_name: string;
            }>(
                `SELECT 'table' AS p1_kind, table_name AS p1_name
                 FROM information_schema.tables
                 WHERE table_schema = 'public'
                   AND left(table_name, 3) = 'p1_'
                 UNION ALL
                 SELECT 'column', column_name
                 FROM information_schema.columns
                 WHERE table_schema = 'public'
                   AND left(table_name, 3) = 'p1_'
                 UNION ALL
                 SELECT 'constraint', p1_constraint.conname
                 FROM pg_constraint AS p1_constraint
                 JOIN pg_class AS p1_table ON p1_table.oid = p1_constraint.conrelid
                 JOIN pg_namespace AS p1_namespace ON p1_namespace.oid = p1_table.relnamespace
                 WHERE p1_namespace.nspname = 'public'
                   AND left(p1_table.relname, 3) = 'p1_'
                   AND p1_constraint.contype <> 'n'
                 UNION ALL
                 SELECT 'index', indexname
                 FROM pg_indexes
                 WHERE schemaname = 'public'
                   AND left(tablename, 3) = 'p1_'`,
            );
            return result.rows;
        });

        expect(names.length).toBeGreaterThan(30);
        expect(names.every((name) => name.p1_name.startsWith("p1_"))).toBe(true);
    });
});

describe("p1 domain schema isolation", () => {
    // These checks exercise database-enforced payload and workspace boundaries.
    it("rejects oversized payloads and cross-workspace foreign keys", async () => {
        await with_database_client(async (database_client) => {
            await database_client.query("DELETE FROM p1_demo_workspaces");
        });
        const owner = await create_p1_demo_workspace({ current_time });
        const other = await create_p1_demo_workspace({ current_time });
        if (!owner.ok || !other.ok) throw new Error("Expected workspace creation to succeed.");

        await expect(
            with_database_client(async (database_client) => {
                await database_client.query(
                    `INSERT INTO p1_source_events (
                         p1_workspace_id,
                         p1_idempotency_key,
                         p1_event_type,
                         p1_payload,
                         p1_received_at
                     ) VALUES ($1, 'oversized', 'commerce.customer.updated', $2, $3)`,
                    [owner.p1_workspace_id, { p1_value: "x".repeat(16_384) }, current_time],
                );
            }),
        ).rejects.toMatchObject({ code: "23514" });

        const source_event_id = await insert_source_event(owner.p1_workspace_id);
        await expect(
            with_database_client(async (database_client) => {
                await database_client.query(
                    `INSERT INTO p1_synchronization_runs (
                         p1_workspace_id,
                         p1_source_event_id,
                         p1_state,
                         p1_created_at,
                         p1_updated_at
                     ) VALUES ($1, $2, 'queued', $3, $3)`,
                    [other.p1_workspace_id, source_event_id, current_time],
                );
            }),
        ).rejects.toMatchObject({ code: "23503" });
    });
});

describe("source event immutability", () => {
    // Accepted source evidence can be deleted by retention but never rewritten.
    it("rejects updates to a persisted source event", async () => {
        await with_database_client(async (database_client) => {
            await database_client.query("DELETE FROM p1_demo_workspaces");
        });
        const workspace = await create_p1_demo_workspace({ current_time });
        if (!workspace.ok) throw new Error("Expected workspace creation to succeed.");
        const source_event_id = await insert_source_event(workspace.p1_workspace_id);

        await expect(
            with_database_client(async (database_client) => {
                await database_client.query(
                    "UPDATE p1_source_events SET p1_payload = '{}' WHERE p1_id = $1",
                    [source_event_id],
                );
            }),
        ).rejects.toMatchObject({ code: "23514" });
    });
});

async function insert_source_event(p1_workspace_id: string): Promise<string> {
    expect(p1_workspace_id).toHaveLength(36);

    return with_database_client(async (database_client) => {
        const result = await database_client.query<{ p1_id: string }>(
            `INSERT INTO p1_source_events (
                 p1_workspace_id,
                 p1_idempotency_key,
                 p1_event_type,
                 p1_payload,
                 p1_received_at
             ) VALUES ($1, 'cross-scope', 'commerce.customer.updated', '{}', $2)
             RETURNING p1_id`,
            [p1_workspace_id, current_time],
        );

        expect(result.rowCount).toBe(1);
        return result.rows[0]?.p1_id ?? "";
    });
}
