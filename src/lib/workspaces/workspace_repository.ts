import assert from "node:assert/strict";
import type { ClientBase } from "pg";

import { with_database_client } from "../database/database_client.ts";
import {
    create_p1_workspace_token,
    hash_p1_workspace_token,
    is_p1_workspace_token,
    p1_workspace_token_max_age_seconds,
} from "./workspace_token.ts";

export const p1_active_workspace_limit = 500;
export const p1_workspace_cleanup_batch_limit = 100;
const p1_workspace_creation_lock_key = 71_001;

export type P1WorkspaceAuthorization = Readonly<{
    p1_expires_at: Date;
    p1_workspace_id: string;
}>;

export type P1WorkspaceCreationResult =
    | Readonly<{
          ok: true;
          p1_expires_at: Date;
          p1_token: string;
          p1_workspace_id: string;
      }>
    | Readonly<{ ok: false; code: "WORKSPACE_CAPACITY_EXCEEDED" }>;

export async function create_p1_demo_workspace(
    options: Readonly<{ current_time: Date }>,
): Promise<P1WorkspaceCreationResult> {
    assert.ok(options.current_time instanceof Date);
    assert.ok(Number.isFinite(options.current_time.getTime()));

    const token = create_p1_workspace_token();
    const expires_at = new Date(
        options.current_time.getTime() + p1_workspace_token_max_age_seconds * 1_000,
    );

    return with_database_client(async (database_client) => {
        await database_client.query("BEGIN");

        try {
            await database_client.query("SELECT pg_advisory_xact_lock($1)", [
                p1_workspace_creation_lock_key,
            ]);
            const active_count_result = await database_client.query<{ p1_active_count: string }>(
                `SELECT count(*) AS p1_active_count
                 FROM p1_demo_workspaces
                 WHERE p1_expires_at > $1`,
                [options.current_time],
            );
            const active_count = Number(active_count_result.rows[0]?.p1_active_count);

            assert.ok(Number.isInteger(active_count));
            assert.ok(active_count >= 0);

            if (active_count >= p1_active_workspace_limit) {
                await database_client.query("ROLLBACK");
                return Object.freeze({ ok: false as const, code: "WORKSPACE_CAPACITY_EXCEEDED" });
            }

            const workspace = await workspace_repository_insert_workspace(database_client, {
                created_at: options.current_time,
                expires_at,
                token_hash: token.token_hash,
            });
            await database_client.query("COMMIT");

            assert.ok(workspace.p1_workspace_id.length > 0);
            assert.ok(workspace.p1_expires_at > options.current_time);

            return Object.freeze({
                ok: true as const,
                p1_expires_at: workspace.p1_expires_at,
                p1_token: token.token,
                p1_workspace_id: workspace.p1_workspace_id,
            });
        } catch (error: unknown) {
            await database_client.query("ROLLBACK");
            throw error;
        }
    });
}

export async function authorize_p1_demo_workspace(
    token: unknown,
    options: Readonly<{ current_time: Date }>,
): Promise<P1WorkspaceAuthorization | null> {
    assert.ok(options.current_time instanceof Date);
    assert.ok(Number.isFinite(options.current_time.getTime()));

    if (!is_p1_workspace_token(token)) {
        return null;
    }

    const token_hash = hash_p1_workspace_token(token);
    return with_database_client(async (database_client) => {
        const result = await database_client.query<{
            p1_expires_at: Date;
            p1_workspace_id: string;
        }>(
            `SELECT p1_id AS p1_workspace_id, p1_expires_at
             FROM p1_demo_workspaces
             WHERE p1_token_hash = $1
               AND p1_expires_at > $2
             LIMIT 1`,
            [token_hash, options.current_time],
        );

        assert.ok(result.rowCount === 0 || result.rowCount === 1);
        if (result.rowCount === 0) return null;

        const workspace = result.rows[0];
        assert.ok(workspace);
        assert.ok(workspace.p1_expires_at > options.current_time);

        return Object.freeze(workspace);
    });
}

export async function cleanup_expired_p1_demo_workspaces(
    options: Readonly<{ batch_limit: number; current_time: Date }>,
): Promise<number> {
    assert.ok(Number.isInteger(options.batch_limit));
    assert.ok(options.batch_limit >= 1);
    assert.ok(options.batch_limit <= p1_workspace_cleanup_batch_limit);

    return with_database_client(async (database_client) => {
        const result = await database_client.query(
            `WITH p1_expired_workspaces AS (
                 SELECT p1_id
                 FROM p1_demo_workspaces
                 WHERE p1_expires_at <= $1
                 ORDER BY p1_expires_at, p1_id
                 LIMIT $2
                 FOR UPDATE SKIP LOCKED
             )
             DELETE FROM p1_demo_workspaces
             WHERE p1_id IN (SELECT p1_id FROM p1_expired_workspaces)`,
            [options.current_time, options.batch_limit],
        );
        const deleted_count = result.rowCount ?? 0;

        assert.ok(deleted_count >= 0);
        assert.ok(deleted_count <= options.batch_limit);

        return deleted_count;
    });
}

async function workspace_repository_insert_workspace(
    database_client: ClientBase,
    options: Readonly<{ created_at: Date; expires_at: Date; token_hash: string }>,
): Promise<Readonly<{ p1_expires_at: Date; p1_workspace_id: string }>> {
    assert.equal(options.token_hash.length, 64);
    assert.ok(options.expires_at > options.created_at);

    const result = await database_client.query<{
        p1_expires_at: Date;
        p1_workspace_id: string;
    }>(
        `WITH p1_workspace AS (
             INSERT INTO p1_demo_workspaces (
                 p1_token_hash,
                 p1_created_at,
                 p1_expires_at
             ) VALUES ($1, $2, $3)
             RETURNING p1_id, p1_expires_at
         ), p1_audit AS (
             INSERT INTO p1_audit_events (
                 p1_workspace_id,
                 p1_action,
                 p1_resource_type,
                 p1_resource_id,
                 p1_created_at
             )
             SELECT p1_id, 'workspace_created', 'workspace', p1_id, $2
             FROM p1_workspace
         )
         SELECT p1_id AS p1_workspace_id, p1_expires_at
         FROM p1_workspace`,
        [options.token_hash, options.created_at, options.expires_at],
    );

    assert.equal(result.rowCount, 1);
    assert.ok(result.rows[0]);

    return Object.freeze(result.rows[0]);
}
