import assert from "node:assert/strict";
import type { ClientBase } from "pg";

import {
    p1_run_attempt_limit,
    p1_run_state_schema,
    p1_workspace_event_limit,
    parse_p1_source_customer_event,
    type P1RunState,
} from "../contracts/synchronization_contracts.ts";
import { with_database_client } from "../database/database_client.ts";
import { enqueue_p1_synchronization } from "../jobs/synchronization_queue.ts";

export type P1AcceptedSourceEvent = Readonly<{
    duplicate: boolean;
    p1_run_id: string;
    p1_source_event_id: string;
}>;

export type P1AcceptSourceEventResult =
    | Readonly<{ ok: true; value: P1AcceptedSourceEvent }>
    | Readonly<{ ok: false; code: "EVENT_LIMIT_REACHED" | "WORKSPACE_UNAUTHORIZED" }>;

export async function accept_p1_source_event(
    input: unknown,
    options: Readonly<{ current_time: Date; p1_workspace_id: string }>,
): Promise<P1AcceptSourceEventResult> {
    assert.ok(options.p1_workspace_id.length > 0);
    assert.ok(options.current_time instanceof Date);

    const source_event = parse_p1_source_customer_event(input);

    return with_database_client(async (database_client) => {
        await database_client.query("BEGIN");

        try {
            const workspace_result = await database_client.query(
                `SELECT p1_id
                 FROM p1_demo_workspaces
                 WHERE p1_id = $1
                   AND p1_expires_at > $2
                 FOR UPDATE`,
                [options.p1_workspace_id, options.current_time],
            );

            if (workspace_result.rowCount !== 1) {
                await database_client.query("ROLLBACK");
                return Object.freeze({ ok: false as const, code: "WORKSPACE_UNAUTHORIZED" });
            }

            const existing = await synchronization_repository_find_existing_event(
                database_client,
                options.p1_workspace_id,
                source_event.p1_idempotency_key,
            );

            if (existing !== null) {
                await database_client.query("COMMIT");
                return Object.freeze({
                    ok: true as const,
                    value: Object.freeze({ ...existing, duplicate: true }),
                });
            }

            const event_count = await accept_p1_source_event_count_events(
                database_client,
                options.p1_workspace_id,
            );

            if (event_count >= p1_workspace_event_limit) {
                await database_client.query("ROLLBACK");
                return Object.freeze({ ok: false as const, code: "EVENT_LIMIT_REACHED" });
            }

            const accepted = await synchronization_repository_insert_event(
                database_client,
                source_event,
                options,
            );
            await database_client.query("COMMIT");

            return Object.freeze({
                ok: true as const,
                value: Object.freeze({ ...accepted, duplicate: false }),
            });
        } catch (error: unknown) {
            await database_client.query("ROLLBACK");
            throw error;
        }
    });
}

export async function transition_p1_synchronization_run(
    options: Readonly<{
        current_time: Date;
        expected_state: P1RunState;
        next_attempt_at: Date | null;
        next_state: P1RunState;
        p1_run_id: string;
        p1_workspace_id: string;
    }>,
): Promise<boolean> {
    assert.ok(options.p1_run_id.length > 0);
    assert.ok(options.p1_workspace_id.length > 0);

    const expected_state = p1_run_state_schema.parse(options.expected_state);
    const next_state = p1_run_state_schema.parse(options.next_state);
    const transition_allowed = synchronization_repository_transition_allowed(
        expected_state,
        next_state,
    );

    if (!transition_allowed) return false;
    if (next_state === "retryable_failure") {
        assert.ok(options.next_attempt_at instanceof Date);
        assert.ok(options.next_attempt_at > options.current_time);
    } else {
        assert.equal(options.next_attempt_at, null);
    }

    const completed_at =
        next_state === "succeeded" || next_state === "terminal_failure"
            ? options.current_time
            : null;
    const increment_attempt_count = next_state === "processing" ? 1 : 0;

    return with_database_client(async (database_client) => {
        const result = await database_client.query(
            `UPDATE p1_synchronization_runs
             SET p1_state = $1,
                 p1_attempt_count = p1_attempt_count + $2,
                 p1_next_attempt_at = $3,
                 p1_completed_at = $4,
                 p1_updated_at = $5
             WHERE p1_id = $6
               AND p1_workspace_id = $7
               AND p1_state = $8
               AND p1_attempt_count + $2 <= $9
               AND ($1 <> 'retryable_failure' OR p1_attempt_count < $9)`,
            [
                next_state,
                increment_attempt_count,
                options.next_attempt_at,
                completed_at,
                options.current_time,
                options.p1_run_id,
                options.p1_workspace_id,
                expected_state,
                p1_run_attempt_limit,
            ],
        );

        assert.ok(result.rowCount === 0 || result.rowCount === 1);
        return result.rowCount === 1;
    });
}

export async function find_p1_synchronization_run(
    options: Readonly<{ p1_run_id: string; p1_workspace_id: string }>,
): Promise<Readonly<{ p1_attempt_count: number; p1_state: P1RunState }> | null> {
    assert.ok(options.p1_run_id.length > 0);
    assert.ok(options.p1_workspace_id.length > 0);

    return with_database_client(async (database_client) => {
        const result = await database_client.query<{
            p1_attempt_count: number;
            p1_state: P1RunState;
        }>(
            `SELECT p1_attempt_count, p1_state
             FROM p1_synchronization_runs
             WHERE p1_id = $1
               AND p1_workspace_id = $2
             LIMIT 1`,
            [options.p1_run_id, options.p1_workspace_id],
        );

        assert.ok(result.rowCount === 0 || result.rowCount === 1);
        return result.rows[0] ? Object.freeze(result.rows[0]) : null;
    });
}

function synchronization_repository_transition_allowed(
    expected_state: P1RunState,
    next_state: P1RunState,
): boolean {
    assert.ok(p1_run_state_schema.safeParse(expected_state).success);
    assert.ok(p1_run_state_schema.safeParse(next_state).success);

    if (expected_state === "queued") return next_state === "processing";
    if (expected_state === "processing") {
        if (next_state === "succeeded") return true;
        if (next_state === "retryable_failure") return true;
        return next_state === "terminal_failure";
    }
    if (expected_state === "retryable_failure") return next_state === "queued";
    return false;
}

async function accept_p1_source_event_count_events(
    database_client: ClientBase,
    p1_workspace_id: string,
): Promise<number> {
    assert.ok(p1_workspace_id.length > 0);
    assert.ok(p1_workspace_event_limit > 0);

    const result = await database_client.query<{ p1_event_count: string }>(
        `SELECT count(*) AS p1_event_count
         FROM p1_source_events
         WHERE p1_workspace_id = $1`,
        [p1_workspace_id],
    );
    const event_count = Number(result.rows[0]?.p1_event_count);

    assert.ok(Number.isInteger(event_count));
    assert.ok(event_count >= 0);

    return event_count;
}

async function synchronization_repository_find_existing_event(
    database_client: ClientBase,
    p1_workspace_id: string,
    p1_idempotency_key: string,
): Promise<Readonly<{ p1_run_id: string; p1_source_event_id: string }> | null> {
    assert.ok(p1_workspace_id.length > 0);
    assert.ok(p1_idempotency_key.length > 0);

    const result = await database_client.query<{
        p1_run_id: string;
        p1_source_event_id: string;
    }>(
        `SELECT p1_source_events.p1_id AS p1_source_event_id,
                p1_synchronization_runs.p1_id AS p1_run_id
         FROM p1_source_events
         JOIN p1_synchronization_runs
           ON p1_synchronization_runs.p1_source_event_id = p1_source_events.p1_id
          AND p1_synchronization_runs.p1_workspace_id = p1_source_events.p1_workspace_id
         WHERE p1_source_events.p1_workspace_id = $1
           AND p1_source_events.p1_idempotency_key = $2
         LIMIT 1`,
        [p1_workspace_id, p1_idempotency_key],
    );

    assert.ok(result.rowCount === 0 || result.rowCount === 1);
    return result.rows[0] ? Object.freeze(result.rows[0]) : null;
}

async function synchronization_repository_insert_event(
    database_client: ClientBase,
    source_event: ReturnType<typeof parse_p1_source_customer_event>,
    options: Readonly<{ current_time: Date; p1_workspace_id: string }>,
): Promise<Readonly<{ p1_run_id: string; p1_source_event_id: string }>> {
    assert.ok(options.p1_workspace_id.length > 0);
    assert.ok(source_event.p1_idempotency_key.length > 0);

    const result = await database_client.query<{
        p1_run_id: string;
        p1_source_event_id: string;
    }>(
        `WITH p1_event AS (
             INSERT INTO p1_source_events (
                 p1_workspace_id,
                 p1_idempotency_key,
                 p1_event_type,
                 p1_payload,
                 p1_received_at
             ) VALUES ($1, $2, $3, $4, $5)
             RETURNING p1_id
         ), p1_run AS (
             INSERT INTO p1_synchronization_runs (
                 p1_workspace_id,
                 p1_source_event_id,
                 p1_state,
                 p1_created_at,
                 p1_updated_at
             )
             SELECT $1, p1_id, 'queued', $5, $5
             FROM p1_event
             RETURNING p1_id, p1_source_event_id
         ), p1_audit AS (
             INSERT INTO p1_audit_events (
                 p1_workspace_id,
                 p1_action,
                 p1_resource_type,
                 p1_resource_id,
                 p1_created_at
             )
             SELECT $1, 'event_accepted', 'source_event', p1_source_event_id, $5
             FROM p1_run
         )
         SELECT p1_id AS p1_run_id, p1_source_event_id
         FROM p1_run`,
        [
            options.p1_workspace_id,
            source_event.p1_idempotency_key,
            source_event.p1_event_type,
            source_event,
            options.current_time,
        ],
    );

    assert.equal(result.rowCount, 1);
    assert.ok(result.rows[0]);
    await enqueue_p1_synchronization(database_client, {
        ...result.rows[0],
        p1_correlation_id: result.rows[0].p1_run_id,
        p1_workspace_id: options.p1_workspace_id,
    });

    return Object.freeze(result.rows[0]);
}
