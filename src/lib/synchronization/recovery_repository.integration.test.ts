// Attempts and resets depend on the prior committed state; parallelizing these loops is invalid.
/* oxlint-disable no-await-in-loop */
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { P1Scenario } from "../contracts/recovery.ts";
import { with_database_client } from "../database/database_client.ts";
import { start_job_runtime, stop_job_runtime } from "../jobs/job_runtime.ts";
import { clear_test_synchronization_jobs } from "../jobs/test_queue_setup.ts";
import * as queue from "../jobs/synchronization_queue.ts";
import { create_p1_simulated_customer_event } from "../simulators/commerce_simulator.ts";
import { create_p1_demo_workspace } from "../workspaces/workspace_repository.ts";
import { mutate_p1_recovery } from "./recovery_repository.ts";
import { accept_p1_source_event } from "./synchronization_repository.ts";
import { read_p1_synchronization_detail } from "./synchronization_queries.ts";
import { process_p1_synchronization } from "./synchronization_worker.ts";

// Real transactions prove bounded failure histories, atomic scheduling, replay, and reset isolation.
beforeEach(clear_test_synchronization_jobs);
afterEach(async () => {
    vi.restoreAllMocks();
    await stop_job_runtime();
});

// Every table row always asserts its final outcome; conditional checks cover only intermediate states.
/* oxlint-disable vitest/no-conditional-expect */
it.each([
    ["rate_limit", 2, "succeeded"],
    ["temporary_outage", 3, "succeeded"],
    ["persistent_outage", 3, "terminal_failure"],
    ["invalid_destination", 1, "terminal_failure"],
] as const)(
    "records bounded %s outcomes with no early or duplicate effects",
    async (scenario, attempts, state) => {
        const job = await accept_scenario(scenario);
        for (let attempt = 1; attempt <= attempts; attempt += 1) {
            const before = Date.now();
            await process_p1_synchronization(job);
            const detail = await read_p1_synchronization_detail(job);
            expect(detail?.p1_attempt_count).toBe(attempt);
            if (attempt < attempts) {
                expect(detail?.p1_state).toBe("retryable_failure");
                expect(detail?.p1_destination).toBeNull();
                const scheduled = detail?.p1_next_attempt_at;
                if (!(scheduled instanceof Date)) throw new Error("Expected scheduled timestamp.");
                expect(scheduled.getTime() - before).toBeGreaterThanOrEqual(attempt * 5_000);
                expect(scheduled.getTime() - before).toBeLessThan(attempt * 5_000 + 1_000);
                expect(await process_p1_synchronization(job)).toBe("ignored");
                await make_due(job.p1_run_id);
            }
        }
        const detail = await read_p1_synchronization_detail(job);
        expect(detail?.p1_state).toBe(state);
        expect(detail?.p1_next_attempt_at).toBeNull();
        expect(detail?.p1_attempts).toHaveLength(attempts);
        expect(await process_p1_synchronization(job)).toBe("ignored");
        expect(detail?.p1_destination === null).toBe(state === "terminal_failure");
        if (scenario === "persistent_outage") expect(detail?.p1_error_code).toBe("RETRY_EXHAUSTED");
    },
);

/* oxlint-enable vitest/no-conditional-expect */
it("delayed retry survives a stopped worker and recovers through real pg-boss delivery", async () => {
    const job = await accept_scenario("rate_limit");
    await start_job_runtime();
    await vi.waitFor(
        async () => {
            expect((await read_p1_synchronization_detail(job))?.p1_state).toBe("retryable_failure");
        },
        { interval: 100, timeout: 3_000 },
    );
    await stop_job_runtime();
    const waiting = await read_p1_synchronization_detail(job);
    expect(waiting?.p1_attempt_count).toBe(1);
    expect(waiting?.p1_delivery_state).toBe("created");
    await start_job_runtime();
    await vi.waitFor(
        async () => {
            expect((await read_p1_synchronization_detail(job))?.p1_state).toBe("succeeded");
        },
        { interval: 100, timeout: 8_000 },
    );
    expect((await read_p1_synchronization_detail(job))?.p1_attempt_count).toBe(2);
}, 15_000);

it("allows one concurrent manual restoration after exhaustion and preserves all four attempts", async () => {
    const job = await accept_scenario("persistent_outage");
    for (let attempt = 0; attempt < 3; attempt += 1) {
        await make_due(job.p1_run_id);
        await process_p1_synchronization(job);
    }
    const results = await Promise.all(
        [1, 2].map(() =>
            mutate_p1_recovery(job.p1_workspace_id, {
                action: "retry",
                p1_run_id: job.p1_run_id,
            }),
        ),
    );
    expect(results.toSorted()).toEqual(["RETRY_ACCEPTED", "RETRY_NOT_ALLOWED"]);
    expect(await process_p1_synchronization(job)).toBe("succeeded");
    const detail = await read_p1_synchronization_detail(job);
    expect(detail?.p1_attempt_count).toBe(4);
    expect(detail?.p1_manual_retry_count).toBe(1);
    expect(detail?.p1_attempts).toHaveLength(4);
    expect(detail?.p1_error_code).toBeNull();
    expect(
        await mutate_p1_recovery(job.p1_workspace_id, {
            action: "retry",
            p1_run_id: job.p1_run_id,
        }),
    ).toBe("RETRY_NOT_ALLOWED");
    expect(await audit_count(job.p1_workspace_id, "retry_requested")).toBe(1);
});

it("denies active, successful, foreign, missing, and expired recovery before new work", async () => {
    const job = await accept_scenario("success");
    const other = await require_workspace();
    expect(await mutate_p1_recovery(other, { action: "retry", p1_run_id: job.p1_run_id })).toBe(
        "RESOURCE_NOT_FOUND",
    );
    expect(await mutate_p1_recovery(other, { action: "retry", p1_run_id: randomUUID() })).toBe(
        "RESOURCE_NOT_FOUND",
    );
    expect(
        await mutate_p1_recovery(job.p1_workspace_id, {
            action: "retry",
            p1_run_id: job.p1_run_id,
        }),
    ).toBe("RETRY_NOT_ALLOWED");
    await process_p1_synchronization(job);
    expect(
        await mutate_p1_recovery(job.p1_workspace_id, {
            action: "retry",
            p1_run_id: job.p1_run_id,
        }),
    ).toBe("RETRY_NOT_ALLOWED");
    expect(
        await mutate_p1_recovery(randomUUID(), { action: "reset", p1_request_id: randomUUID() }),
    ).toBe("WORKSPACE_UNAUTHORIZED");
    await with_database_client((client) =>
        client.query(
            `UPDATE p1_demo_workspaces SET p1_created_at = now() - interval '2 days',
         p1_expires_at = now() - interval '1 day' WHERE p1_id = $1`,
            [other],
        ),
    );
    expect(await mutate_p1_recovery(other, { action: "reset", p1_request_id: randomUUID() })).toBe(
        "WORKSPACE_UNAUTHORIZED",
    );
    expect(await audit_count(job.p1_workspace_id, "retry_requested")).toBe(0);
});

it("rolls back the failed attempt and delayed job together when scheduling fails", async () => {
    const job = await accept_scenario("rate_limit");
    const original = queue.enqueue_p1_recovery;
    vi.spyOn(queue, "enqueue_p1_recovery").mockImplementationOnce(async (...args) => {
        await original(...args);
        throw new Error("Injected scheduling failure.");
    });
    await expect(process_p1_synchronization(job)).rejects.toThrow("Injected scheduling failure.");
    const detail = await read_p1_synchronization_detail(job);
    expect(detail).toMatchObject({
        p1_state: "queued",
        p1_attempt_count: 0,
        p1_attempts: [],
        p1_destination: null,
    });
    expect(await job_count(job.p1_workspace_id)).toBe(1);
});

it("rolls back manual state, job, and audit when scheduling acknowledgement fails", async () => {
    const job = await accept_scenario("invalid_destination");
    await process_p1_synchronization(job);
    const original = queue.enqueue_p1_recovery;
    vi.spyOn(queue, "enqueue_p1_recovery").mockImplementationOnce(async (...args) => {
        await original(...args);
        throw new Error("Injected manual failure.");
    });
    await expect(
        mutate_p1_recovery(job.p1_workspace_id, { action: "retry", p1_run_id: job.p1_run_id }),
    ).rejects.toThrow("Injected manual failure.");
    expect(await read_p1_synchronization_detail(job)).toMatchObject({
        p1_state: "terminal_failure",
        p1_manual_retry_count: 0,
    });
    expect(await audit_count(job.p1_workspace_id, "retry_requested")).toBe(0);
    expect(await job_count(job.p1_workspace_id)).toBe(1);
});

it("resets only owned records, preserves audits, and makes duplicate reset requests harmless", async () => {
    const job = await accept_scenario("rate_limit");
    const other = await accept_scenario("success");
    await process_p1_synchronization(job);
    await process_p1_synchronization(other);
    const request = { action: "reset" as const, p1_request_id: randomUUID() };
    const results = await Promise.all(
        [1, 2].map(() => mutate_p1_recovery(job.p1_workspace_id, request)),
    );
    expect(results).toEqual(["WORKSPACE_RESET", "WORKSPACE_RESET"]);
    expect(await read_p1_synchronization_detail(job)).toBeNull();
    expect(await process_p1_synchronization(job)).toBe("ignored");
    expect((await read_p1_synchronization_detail(other))?.p1_state).toBe("succeeded");
    expect(await audit_count(job.p1_workspace_id, "workspace_reset")).toBe(1);
    expect(await audit_count(job.p1_workspace_id, "event_accepted")).toBe(1);
    const fresh = await accept_scenario("success", job.p1_workspace_id);
    expect(await mutate_p1_recovery(job.p1_workspace_id, request)).toBe("WORKSPACE_RESET");
    expect(await read_p1_synchronization_detail(fresh)).not.toBeNull();
    for (let index = 0; index < 2; index += 1) {
        expect(
            await mutate_p1_recovery(job.p1_workspace_id, {
                action: "reset",
                p1_request_id: randomUUID(),
            }),
        ).toBe("WORKSPACE_RESET");
    }
    expect(
        await mutate_p1_recovery(job.p1_workspace_id, {
            action: "reset",
            p1_request_id: randomUUID(),
        }),
    ).toBe("RESET_LIMIT_REACHED");
    expect(await mutate_p1_recovery(job.p1_workspace_id, request)).toBe("WORKSPACE_RESET");
});

it("rolls back queue cancellation and deletion when reset fails", async () => {
    const job = await accept_scenario("success");
    const original = queue.cancel_p1_workspace_jobs;
    vi.spyOn(queue, "cancel_p1_workspace_jobs").mockImplementationOnce(async (...args) => {
        await original(...args);
        throw new Error("Injected reset failure.");
    });
    await expect(
        mutate_p1_recovery(job.p1_workspace_id, { action: "reset", p1_request_id: randomUUID() }),
    ).rejects.toThrow("Injected reset failure.");
    expect((await read_p1_synchronization_detail(job))?.p1_delivery_state).toBe("created");
    expect(await audit_count(job.p1_workspace_id, "workspace_reset")).toBe(0);
});

it("denies a fifth attempt, repeated manual restoration, and unsupported persisted scenarios", async () => {
    const job = await accept_scenario("success");
    await expect(
        with_database_client((client) =>
            client.query(
                "UPDATE p1_synchronization_runs SET p1_attempt_count = 4 WHERE p1_id = $1",
                [job.p1_run_id],
            ),
        ),
    ).rejects.toMatchObject({ code: "23514" });
    await with_database_client((client) =>
        client.query(
            "UPDATE p1_synchronization_runs SET p1_manual_retry_count = 1, p1_attempt_count = 4 WHERE p1_id = $1",
            [job.p1_run_id],
        ),
    );
    await expect(
        with_database_client((client) =>
            client.query(
                "UPDATE p1_synchronization_runs SET p1_attempt_count = 5 WHERE p1_id = $1",
                [job.p1_run_id],
            ),
        ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
        with_database_client((client) =>
            client.query(
                "UPDATE p1_synchronization_runs SET p1_manual_retry_count = 2 WHERE p1_id = $1",
                [job.p1_run_id],
            ),
        ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
        with_database_client((client) =>
            client.query(
                "UPDATE p1_synchronization_runs SET p1_scenario = 'real' WHERE p1_id = $1",
                [job.p1_run_id],
            ),
        ),
    ).rejects.toMatchObject({ code: "23514" });
});

it("serializes reset against effect processing without leaving a customer or resurrecting a run", async () => {
    const job = await accept_scenario("success");
    await Promise.all([
        process_p1_synchronization(job),
        mutate_p1_recovery(job.p1_workspace_id, { action: "reset", p1_request_id: randomUUID() }),
    ]);
    expect(await read_p1_synchronization_detail(job)).toBeNull();
    expect(await process_p1_synchronization(job)).toBe("ignored");
    const customers = await with_database_client((client) =>
        client.query("SELECT p1_id FROM p1_simulated_crm_customers WHERE p1_workspace_id = $1", [
            job.p1_workspace_id,
        ]),
    );
    expect(customers.rows).toEqual([]);
});

it("restores a transport-stopped run once while denying a scheduled domain retry", async () => {
    const job = await accept_scenario("rate_limit");
    await process_p1_synchronization(job);
    expect(
        await mutate_p1_recovery(job.p1_workspace_id, {
            action: "retry",
            p1_run_id: job.p1_run_id,
        }),
    ).toBe("RETRY_NOT_ALLOWED");
    // A disposable fixture models pg-boss exhausted delivery independently of domain attempts.
    await with_database_client((client) =>
        client.query(
            `UPDATE p1_job.job SET state = 'failed' WHERE id = (
            SELECT p1_delivery_job_id FROM p1_synchronization_runs WHERE p1_id = $1)`,
            [job.p1_run_id],
        ),
    );
    expect(
        await mutate_p1_recovery(job.p1_workspace_id, {
            action: "retry",
            p1_run_id: job.p1_run_id,
        }),
    ).toBe("RETRY_ACCEPTED");
    expect(await process_p1_synchronization(job)).toBe("succeeded");
    expect((await read_p1_synchronization_detail(job))?.p1_attempt_count).toBe(2);
});

async function require_workspace() {
    const workspace = await create_p1_demo_workspace({ current_time: new Date() });
    if (!workspace.ok) throw new Error("Expected workspace.");
    expect(workspace.p1_workspace_id).toHaveLength(36);
    return workspace.p1_workspace_id;
}
async function accept_scenario(p1_scenario: P1Scenario, p1_workspace_id?: string) {
    const workspace = p1_workspace_id ?? (await require_workspace());
    const event = create_p1_simulated_customer_event({
        p1_customer_number: 1,
        p1_revision: 1,
        p1_scenario,
    });
    const result = await accept_p1_source_event(event, {
        p1_workspace_id: workspace,
        p1_scenario,
        current_time: new Date(),
    });
    if (!result.ok) throw new Error("Expected accepted event.");
    expect(result.value.duplicate).toBe(false);
    return {
        p1_run_id: result.value.p1_run_id,
        p1_source_event_id: result.value.p1_source_event_id,
        p1_workspace_id: workspace,
        p1_correlation_id: result.value.p1_run_id,
    };
}
async function make_due(run_id: string) {
    await with_database_client((client) =>
        client.query(
            "UPDATE p1_synchronization_runs SET p1_next_attempt_at = now() - interval '1 second' WHERE p1_id = $1",
            [run_id],
        ),
    );
}
async function audit_count(workspace_id: string, action: string) {
    const result = await with_database_client((client) =>
        client.query<{ count: number }>(
            "SELECT count(*)::int AS count FROM p1_audit_events WHERE p1_workspace_id = $1 AND p1_action = $2",
            [workspace_id, action],
        ),
    );
    return result.rows[0]?.count;
}
async function job_count(workspace_id: string) {
    const result = await with_database_client((client) =>
        client.query<{ count: number }>(
            "SELECT count(*)::int AS count FROM p1_job.job WHERE name = 'p1_synchronization' AND data->>'p1_workspace_id' = $1",
            [workspace_id],
        ),
    );
    return result.rows[0]?.count;
}
