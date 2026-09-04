import { describe, expect, it } from "vitest";

import { p1_workspace_event_limit } from "../contracts/synchronization_contracts.ts";
import { with_database_client } from "../database/database_client.ts";
import {
    accept_p1_source_event,
    find_p1_synchronization_run,
    transition_p1_synchronization_run,
} from "../synchronization/synchronization_repository.ts";
import {
    authorize_p1_demo_workspace,
    cleanup_expired_p1_demo_workspaces,
    create_p1_demo_workspace,
    p1_active_workspace_limit,
} from "./workspace_repository.ts";

const current_time = new Date("2026-09-04T22:00:00.000Z");
const valid_source_event = Object.freeze({
    p1_customer: {
        p1_email: "grace@example.test",
        p1_external_id: "customer_101",
        p1_first_name: "Grace",
        p1_last_name: "Hopper",
        p1_updated_at: "2026-09-04T21:00:00.000Z",
    },
    p1_event_type: "commerce.customer.updated",
    p1_idempotency_key: "event_101",
});

describe("workspace authorization persistence", () => {
    // This real PostgreSQL check proves hashing plus malformed and expired token denial.
    it("stores only a token hash and denies unusable tokens", async () => {
        await reset_domain_tables();
        const creation = await require_workspace();
        const authorization = await authorize_p1_demo_workspace(creation.p1_token, {
            current_time,
        });
        const stored_token = await with_database_client(async (database_client) => {
            const result = await database_client.query<{ p1_token_hash: string }>(
                "SELECT p1_token_hash FROM p1_demo_workspaces WHERE p1_id = $1",
                [creation.p1_workspace_id],
            );
            return result.rows[0]?.p1_token_hash;
        });

        expect(authorization?.p1_workspace_id).toBe(creation.p1_workspace_id);
        expect(stored_token).toHaveLength(64);
        expect(stored_token).not.toContain(creation.p1_token);
        await expect(
            authorize_p1_demo_workspace("malformed", { current_time }),
        ).resolves.toBeNull();

        await expire_workspace(creation.p1_workspace_id);
        await expect(
            authorize_p1_demo_workspace(creation.p1_token, { current_time }),
        ).resolves.toBeNull();
    });
});

describe("workspace cleanup", () => {
    // Cleanup is intentionally batched and must preserve active and unselected rows.
    it("deletes only expired workspaces up to the cleanup boundary", async () => {
        await reset_domain_tables();
        const first = await require_workspace();
        const second = await require_workspace();
        const active = await require_workspace();
        await expire_workspace(first.p1_workspace_id);
        await expire_workspace(second.p1_workspace_id);

        const deleted_count = await cleanup_expired_p1_demo_workspaces({
            batch_limit: 1,
            current_time,
        });
        const remaining_ids = await read_workspace_ids();

        expect(deleted_count).toBe(1);
        expect(remaining_ids).toContain(active.p1_workspace_id);
        expect(remaining_ids).toHaveLength(2);
    });

    it.each([0, 101])("rejects cleanup batch boundary %i", async (batch_limit) => {
        await expect(
            cleanup_expired_p1_demo_workspaces({ batch_limit, current_time }),
        ).rejects.toThrow(/batch_limit/u);
    });
});

describe("workspace and event resource bounds", () => {
    // Capacity checks serialize creation and reject work beyond current public-demo limits.
    it("denies workspace creation at the active workspace limit", async () => {
        await reset_domain_tables();
        await with_database_client(async (database_client) => {
            await database_client.query(
                `INSERT INTO p1_demo_workspaces (
                     p1_token_hash,
                     p1_created_at,
                     p1_expires_at
                 )
                 SELECT lpad(p1_number::text, 64, '0'), $1, $2
                 FROM generate_series(1, $3) AS p1_number`,
                [current_time, new Date("2026-09-05T22:00:00.000Z"), p1_active_workspace_limit],
            );
        });

        await expect(create_p1_demo_workspace({ current_time })).resolves.toEqual({
            code: "WORKSPACE_CAPACITY_EXCEEDED",
            ok: false,
        });
    });

    it("denies a new event at the retained event limit", async () => {
        await reset_domain_tables();
        const workspace = await require_workspace();
        await insert_source_events_to_limit(workspace.p1_workspace_id);

        await expect(
            accept_p1_source_event(valid_source_event, {
                current_time,
                p1_workspace_id: workspace.p1_workspace_id,
            }),
        ).resolves.toEqual({ code: "EVENT_LIMIT_REACHED", ok: false });
    });
});

describe("source event idempotency and workspace scope", () => {
    // Duplicate delivery must converge, while another workspace cannot discover the run.
    it("creates one logical run and scopes reads by workspace", async () => {
        await reset_domain_tables();
        const owner = await require_workspace();
        const other = await require_workspace();
        const first = await accept_p1_source_event(valid_source_event, {
            current_time,
            p1_workspace_id: owner.p1_workspace_id,
        });
        const duplicate = await accept_p1_source_event(valid_source_event, {
            current_time,
            p1_workspace_id: owner.p1_workspace_id,
        });

        expect(first.ok).toBe(true);
        expect(duplicate).toEqual(
            first.ok ? { ok: true, value: { ...first.value, duplicate: true } } : first,
        );
        if (!first.ok) throw new Error("Expected event acceptance to succeed.");

        await expect(
            find_p1_synchronization_run({
                p1_run_id: first.value.p1_run_id,
                p1_workspace_id: other.p1_workspace_id,
            }),
        ).resolves.toBeNull();
        await expect(
            transition_run(
                {
                    p1_run_id: first.value.p1_run_id,
                    p1_workspace_id: other.p1_workspace_id,
                },
                "queued",
                "processing",
            ),
        ).resolves.toBe(false);
        await expect(read_domain_counts()).resolves.toEqual({
            accepted_audits: 1,
            events: 1,
            runs: 1,
        });
    });

    it("rejects invalid input before persistence", async () => {
        await reset_domain_tables();
        const workspace = await require_workspace();
        const invalid_event = {
            ...valid_source_event,
            p1_customer: { ...valid_source_event.p1_customer, p1_first_name: "x".repeat(81) },
        };

        await expect(
            accept_p1_source_event(invalid_event, {
                current_time,
                p1_workspace_id: workspace.p1_workspace_id,
            }),
        ).rejects.toThrow(/./u);
        await expect(read_domain_counts()).resolves.toEqual({
            accepted_audits: 0,
            events: 0,
            runs: 0,
        });
    });
});

describe("event authorization boundary", () => {
    // A valid event cannot create state for a missing or expired workspace.
    it("denies an unknown workspace before event persistence", async () => {
        await reset_domain_tables();

        await expect(
            accept_p1_source_event(valid_source_event, {
                current_time,
                p1_workspace_id: "4998b96e-07cb-4723-a566-f398723d8938",
            }),
        ).resolves.toEqual({ code: "WORKSPACE_UNAUTHORIZED", ok: false });
        await expect(read_domain_counts()).resolves.toEqual({
            accepted_audits: 0,
            events: 0,
            runs: 0,
        });
    });
});

describe("synchronization run transitions", () => {
    // Compare-and-set transitions reject invalid edges and the fourth processing attempt.
    it("allows declared transitions and rejects exhausted transitions", async () => {
        await reset_domain_tables();
        const workspace = await require_workspace();
        const accepted = await accept_p1_source_event(valid_source_event, {
            current_time,
            p1_workspace_id: workspace.p1_workspace_id,
        });
        if (!accepted.ok) throw new Error("Expected event acceptance to succeed.");

        const run_options = {
            p1_run_id: accepted.value.p1_run_id,
            p1_workspace_id: workspace.p1_workspace_id,
        };
        await expect(transition_run(run_options, "queued", "processing")).resolves.toBe(true);
        await expect(transition_run(run_options, "processing", "queued")).resolves.toBe(false);
        await complete_retry_cycle(run_options);
        await complete_retry_cycle(run_options);
        await expect(transition_run(run_options, "processing", "retryable_failure")).resolves.toBe(
            false,
        );
        await expect(
            transition_p1_synchronization_run({
                ...run_options,
                current_time,
                expected_state: "processing",
                next_attempt_at: null,
                next_state: "terminal_failure",
            }),
        ).resolves.toBe(true);

        await expect(find_p1_synchronization_run(run_options)).resolves.toEqual({
            p1_attempt_count: 3,
            p1_state: "terminal_failure",
        });
    });
});

describe("terminal synchronization transitions", () => {
    // Both terminal outcomes persist and reject any later transition.
    it("supports success and terminal failure as final states", async () => {
        await reset_domain_tables();
        const workspace = await require_workspace();
        const success = await accept_event_with_key(workspace.p1_workspace_id, "success");
        const failure = await accept_event_with_key(workspace.p1_workspace_id, "failure");

        await expect(transition_run(success, "queued", "processing")).resolves.toBe(true);
        await expect(
            transition_p1_synchronization_run({
                ...success,
                current_time,
                expected_state: "processing",
                next_attempt_at: null,
                next_state: "succeeded",
            }),
        ).resolves.toBe(true);
        await expect(transition_run(failure, "queued", "processing")).resolves.toBe(true);
        await expect(
            transition_p1_synchronization_run({
                ...failure,
                current_time,
                expected_state: "processing",
                next_attempt_at: null,
                next_state: "terminal_failure",
            }),
        ).resolves.toBe(true);
        await expect(
            transition_p1_synchronization_run({
                ...success,
                current_time,
                expected_state: "succeeded",
                next_attempt_at: null,
                next_state: "queued",
            }),
        ).resolves.toBe(false);
    });
});

type RunOptions = Readonly<{ p1_run_id: string; p1_workspace_id: string }>;
type TransitionalState = "processing" | "queued" | "retryable_failure";

async function complete_retry_cycle(run_options: RunOptions): Promise<void> {
    await expect(transition_run(run_options, "processing", "retryable_failure")).resolves.toBe(
        true,
    );
    await expect(transition_run(run_options, "retryable_failure", "queued")).resolves.toBe(true);
    await expect(transition_run(run_options, "queued", "processing")).resolves.toBe(true);
}

function transition_run(
    run_options: RunOptions,
    expected_state: TransitionalState,
    next_state: TransitionalState,
): Promise<boolean> {
    return transition_p1_synchronization_run({
        current_time,
        expected_state,
        next_attempt_at:
            next_state === "retryable_failure" ? new Date("2026-09-04T22:01:00.000Z") : null,
        next_state,
        ...run_options,
    });
}

async function accept_event_with_key(
    p1_workspace_id: string,
    p1_idempotency_key: string,
): Promise<RunOptions> {
    const result = await accept_p1_source_event(
        { ...valid_source_event, p1_idempotency_key },
        { current_time, p1_workspace_id },
    );

    if (!result.ok) throw new Error("Expected event acceptance to succeed.");
    return { p1_run_id: result.value.p1_run_id, p1_workspace_id };
}

async function insert_source_events_to_limit(p1_workspace_id: string): Promise<void> {
    await with_database_client(async (database_client) => {
        await database_client.query(
            `INSERT INTO p1_source_events (
                 p1_workspace_id,
                 p1_idempotency_key,
                 p1_event_type,
                 p1_payload,
                 p1_received_at
             )
             SELECT $1,
                    'limit_' || p1_number::text,
                    'commerce.customer.updated',
                    '{}',
                    $2
             FROM generate_series(1, $3) AS p1_number`,
            [p1_workspace_id, current_time, p1_workspace_event_limit],
        );
    });
}

async function require_workspace(): Promise<{
    p1_token: string;
    p1_workspace_id: string;
}> {
    const creation = await create_p1_demo_workspace({ current_time });

    if (!creation.ok) throw new Error("Expected workspace creation to succeed.");
    return creation;
}

async function expire_workspace(p1_workspace_id: string): Promise<void> {
    await with_database_client(async (database_client) => {
        await database_client.query(
            `UPDATE p1_demo_workspaces
             SET p1_created_at = $1,
                 p1_expires_at = $2
             WHERE p1_id = $3`,
            [
                new Date("2026-09-02T22:00:00.000Z"),
                new Date("2026-09-03T22:00:00.000Z"),
                p1_workspace_id,
            ],
        );
    });
}

async function read_workspace_ids(): Promise<string[]> {
    return with_database_client(async (database_client) => {
        const result = await database_client.query<{ p1_id: string }>(
            "SELECT p1_id FROM p1_demo_workspaces ORDER BY p1_id",
        );
        return result.rows.map((row) => row.p1_id);
    });
}

async function read_domain_counts(): Promise<{
    accepted_audits: number;
    events: number;
    runs: number;
}> {
    return with_database_client(async (database_client) => {
        const result = await database_client.query<{
            p1_accepted_audits: string;
            p1_events: string;
            p1_runs: string;
        }>(
            `SELECT
                 (SELECT count(*) FROM p1_audit_events
                  WHERE p1_action = 'event_accepted') AS p1_accepted_audits,
                 (SELECT count(*) FROM p1_source_events) AS p1_events,
                 (SELECT count(*) FROM p1_synchronization_runs) AS p1_runs`,
        );
        return {
            accepted_audits: Number(result.rows[0]?.p1_accepted_audits),
            events: Number(result.rows[0]?.p1_events),
            runs: Number(result.rows[0]?.p1_runs),
        };
    });
}

async function reset_domain_tables(): Promise<void> {
    await with_database_client(async (database_client) => {
        await database_client.query("DELETE FROM p1_demo_workspaces");
    });
}
