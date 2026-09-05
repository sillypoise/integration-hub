import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clear_test_synchronization_jobs } from "./test_queue_setup.ts";

import { with_database_client } from "../database/database_client.ts";
import { create_p1_simulated_customer_event } from "../simulators/commerce_simulator.ts";
import { upsert_p1_simulated_crm_customer } from "../simulators/crm_simulator.ts";
import * as crm_simulator from "../simulators/crm_simulator.ts";
import { map_p1_customer_event } from "../synchronization/customer_mapping.ts";
import {
    list_p1_synchronization_runs,
    read_p1_synchronization_detail,
} from "../synchronization/synchronization_queries.ts";
import {
    accept_p1_source_event,
    find_p1_synchronization_run,
} from "../synchronization/synchronization_repository.ts";
import { process_p1_synchronization } from "../synchronization/synchronization_worker.ts";
import * as synchronization_worker from "../synchronization/synchronization_worker.ts";
import { create_p1_demo_workspace } from "../workspaces/workspace_repository.ts";
import { start_job_runtime, stop_job_runtime } from "./job_runtime.ts";
import * as synchronization_queue from "./synchronization_queue.ts";

// Real PostgreSQL checks couple intake, queue, worker, destination, and scoped inspection.
beforeEach(clear_test_synchronization_jobs);
afterEach(async () => {
    vi.restoreAllMocks();
    await stop_job_runtime();
});

it("atomically accepts concurrent duplicates into one run and one identifier-only job", async () => {
    const workspace = await require_workspace();
    const source = create_p1_simulated_customer_event({
        p1_customer_number: 1,
        p1_revision: 1,
    });
    const results = await Promise.all(
        [1, 2].map(() =>
            accept_p1_source_event(source, {
                current_time: new Date(),
                p1_workspace_id: workspace.p1_workspace_id,
            }),
        ),
    );
    expect(results[0]?.ok).toBe(true);
    expect(results[1]?.ok).toBe(true);
    const runs = await list_p1_synchronization_runs({ ...workspace, p1_page: 1 });
    expect(runs).toHaveLength(1);
    const jobs = await with_database_client(async (database_client) =>
        database_client.query(
            `SELECT data, retry_limit, expire_seconds FROM p1_job.job
             WHERE name = 'p1_synchronization' AND id = $1`,
            [runs[0]?.p1_run_id],
        ),
    );
    expect(jobs.rows).toHaveLength(1);
    expect(jobs.rows[0]).toMatchObject({ retry_limit: 2, expire_seconds: 30 });
    expect(jobs.rows[0]?.data).toEqual({
        p1_workspace_id: workspace.p1_workspace_id,
        p1_run_id: runs[0]?.p1_run_id,
        p1_source_event_id: runs[0]?.p1_source_event_id,
        p1_correlation_id: runs[0]?.p1_run_id,
    });
});

it("rolls back accepted rows and queued work when enqueue acknowledgement fails", async () => {
    const workspace = await require_workspace();
    const original_enqueue = synchronization_queue.enqueue_p1_synchronization;
    vi.spyOn(synchronization_queue, "enqueue_p1_synchronization").mockImplementation(
        async (database_client, payload) => {
            await original_enqueue(database_client, payload);
            throw new Error("Injected acknowledgement failure.");
        },
    );
    await expect(accept_event(workspace.p1_workspace_id, 1)).rejects.toThrow(
        "Injected acknowledgement failure.",
    );
    expect(await list_p1_synchronization_runs({ ...workspace, p1_page: 1 })).toEqual([]);
    const counts = await count_effects(workspace.p1_workspace_id);
    expect(counts).toEqual({ events: 0, effects: 0, customers: 0, attempts: 0, jobs: 0 });
});

it("finishes durable work after restart and converges when completion is replayed", async () => {
    const workspace = await require_workspace();
    const job = await accept_event(workspace.p1_workspace_id, 1);
    await start_job_runtime();
    await stop_job_runtime();
    await start_job_runtime();
    await vi.waitFor(
        async () => {
            expect(await find_p1_synchronization_run(job)).toEqual({
                p1_attempt_count: 1,
                p1_state: "succeeded",
            });
        },
        { interval: 100, timeout: 5_000 },
    );
    expect(await process_p1_synchronization(job)).toBe("ignored");
    const detail = await read_p1_synchronization_detail(job);
    expect(detail?.p1_destination).toEqual(
        map_p1_customer_event(
            create_p1_simulated_customer_event({ p1_customer_number: 1, p1_revision: 1 }),
        ),
    );
    expect(detail?.p1_attempts).toEqual([
        expect.objectContaining({
            p1_attempt_number: 1,
            p1_state: "succeeded",
            p1_error_code: null,
        }),
    ]);
    expect(await count_effects(workspace.p1_workspace_id)).toEqual({
        events: 1,
        effects: 1,
        customers: 1,
        attempts: 1,
        jobs: 1,
    });
}, 15_000);

it("retries transport failures within its bound and stores only a safe queue error", async () => {
    const workspace = await require_workspace();
    const job = await accept_event(workspace.p1_workspace_id, 1);
    vi.spyOn(synchronization_worker, "process_p1_synchronization").mockRejectedValue(
        new Error("postgresql://must-not-persist"),
    );
    await start_job_runtime();
    await vi.waitFor(
        async () => {
            const result = await with_database_client(async (database_client) =>
                database_client.query(
                    "SELECT state, retry_count, output FROM p1_job.job WHERE id = $1",
                    [job.p1_run_id],
                ),
            );
            expect(result.rows[0]).toMatchObject({ state: "failed", retry_count: 2 });
            expect(JSON.stringify(result.rows[0]?.output)).not.toContain("must-not-persist");
            expect(JSON.stringify(result.rows[0]?.output)).toContain("Synchronization job failed.");
        },
        { interval: 100, timeout: 8_000 },
    );
    expect((await read_p1_synchronization_detail(job))?.p1_delivery_state).toBe("failed");
    expect((await count_effects(workspace.p1_workspace_id)).effects).toBe(0);
}, 12_000);

it("upserts one customer and prevents stale deliveries or repeated effects overwriting it", async () => {
    const workspace = await require_workspace();
    const latest = await accept_event(workspace.p1_workspace_id, 2);
    const old = await accept_event(workspace.p1_workspace_id, 1);
    expect(await process_p1_synchronization(latest)).toBe("succeeded");
    expect(await process_p1_synchronization(old)).toBe("succeeded");
    const customer = map_p1_customer_event(
        create_p1_simulated_customer_event({
            p1_customer_number: 1,
            p1_revision: 1,
        }),
    );
    const duplicate = await with_database_client(async (database_client) =>
        upsert_p1_simulated_crm_customer(database_client, { job: old, customer }),
    );
    expect(duplicate).toBe(false);
    const stored = await with_database_client(async (database_client) =>
        database_client.query(
            "SELECT p1_payload FROM p1_simulated_crm_customers WHERE p1_workspace_id = $1",
            [workspace.p1_workspace_id],
        ),
    );
    expect(stored.rows[0]?.p1_payload.p1_source_updated_at).toBe("2026-01-01T00:00:02.000Z");
    expect((await count_effects(workspace.p1_workspace_id)).effects).toBe(2);
    expect(stored.rows).toHaveLength(1);
});

it("denies cross-workspace, mismatched source, unknown, expired, and exhausted jobs", async () => {
    const owner = await require_workspace();
    const other = await require_workspace();
    const job = await accept_event(owner.p1_workspace_id, 1);
    const foreign = { ...job, p1_workspace_id: other.p1_workspace_id };
    expect(await process_p1_synchronization(foreign)).toBe("ignored");
    expect(await read_p1_synchronization_detail(foreign)).toBeNull();
    expect(await list_p1_synchronization_runs({ ...other, p1_page: 1 })).toEqual([]);
    expect(await process_p1_synchronization({ ...job, p1_source_event_id: randomUUID() })).toBe(
        "ignored",
    );
    expect(await process_p1_synchronization({ ...job, p1_run_id: randomUUID() })).toBe("ignored");
    await with_database_client(async (database_client) => {
        await database_client.query(
            "UPDATE p1_synchronization_runs SET p1_attempt_count = 3 WHERE p1_id = $1",
            [job.p1_run_id],
        );
    });
    expect(await process_p1_synchronization(job)).toBe("ignored");
    await with_database_client(async (database_client) => {
        await database_client.query(
            `UPDATE p1_demo_workspaces
                SET p1_created_at = now() - interval '2 days',
                    p1_expires_at = now() - interval '1 day' WHERE p1_id = $1`,
            [owner.p1_workspace_id],
        );
    });
    expect(await process_p1_synchronization(job)).toBe("ignored");
    expect(await read_p1_synchronization_detail(job)).toBeNull();
    expect(await list_p1_synchronization_runs({ ...owner, p1_page: 1 })).toEqual([]);
    expect((await count_effects(owner.p1_workspace_id)).effects).toBe(0);
});

it("rolls back processing and effects on destination failure, then recovers", async () => {
    const workspace = await require_workspace();
    const job = await accept_event(workspace.p1_workspace_id, 1);
    // Throw after the real effect write to prove neither effects nor attempts partially commit.
    const original_upsert = crm_simulator.upsert_p1_simulated_crm_customer;
    const spy = vi
        .spyOn(crm_simulator, "upsert_p1_simulated_crm_customer")
        .mockImplementationOnce(async (database_client, options) => {
            await original_upsert(database_client, options);
            throw new Error("Injected destination acknowledgement failure.");
        });
    await expect(process_p1_synchronization(job)).rejects.toThrow(
        "Injected destination acknowledgement failure.",
    );
    expect(await find_p1_synchronization_run(job)).toEqual({
        p1_state: "queued",
        p1_attempt_count: 0,
    });
    expect(await count_effects(workspace.p1_workspace_id)).toEqual({
        events: 1,
        effects: 0,
        customers: 0,
        attempts: 0,
        jobs: 1,
    });
    spy.mockRestore();
    expect(await process_p1_synchronization(job)).toBe("succeeded");
    expect((await count_effects(workspace.p1_workspace_id)).effects).toBe(1);
});

it("bounds pagination and keeps adjacent pages disjoint", async () => {
    const workspace = await require_workspace();
    await Promise.all(
        Array.from({ length: 21 }, (_, index) =>
            accept_event(workspace.p1_workspace_id, index + 1),
        ),
    );
    const first = await list_p1_synchronization_runs({ ...workspace, p1_page: 1 });
    const second = await list_p1_synchronization_runs({ ...workspace, p1_page: 2 });
    expect(first).toHaveLength(20);
    expect(second).toHaveLength(1);
    expect(first.map((run) => run.p1_run_id)).not.toContain(second[0]?.p1_run_id);
    expect(await list_p1_synchronization_runs({ ...workspace, p1_page: 50 })).toEqual([]);
});

it("database ownership constraints reject a foreign CRM effect", async () => {
    const owner = await require_workspace();
    const other = await require_workspace();
    const job = await accept_event(owner.p1_workspace_id, 1);
    const customer = map_p1_customer_event(
        create_p1_simulated_customer_event({
            p1_customer_number: 1,
            p1_revision: 1,
        }),
    );
    await expect(
        with_database_client(async (database_client) =>
            upsert_p1_simulated_crm_customer(database_client, {
                job: { ...job, p1_workspace_id: other.p1_workspace_id },
                customer,
            }),
        ),
    ).rejects.toMatchObject({ code: "23503" });
    expect((await count_effects(other.p1_workspace_id)).effects).toBe(0);
});

it.each([0, 51, 1.5])("rejects out-of-bounds list page %s", async (p1_page) => {
    await expect(
        list_p1_synchronization_runs({ p1_workspace_id: randomUUID(), p1_page }),
    ).rejects.toThrow(/Too|Invalid/u);
});

it("rejects customer-bearing jobs before any processing", async () => {
    await expect(process_p1_synchronization({ p1_email: "not-a-job" })).rejects.toThrow(
        /Invalid|Unrecognized/u,
    );
});

async function require_workspace() {
    const workspace = await create_p1_demo_workspace({ current_time: new Date() });
    if (!workspace.ok) throw new Error("Workspace creation failed.");
    expect(workspace.p1_workspace_id).toHaveLength(36);
    return workspace;
}

async function accept_event(p1_workspace_id: string, p1_revision: number) {
    const source = create_p1_simulated_customer_event({ p1_customer_number: 1, p1_revision });
    const result = await accept_p1_source_event(source, {
        current_time: new Date(),
        p1_workspace_id,
    });
    if (!result.ok) throw new Error("Event acceptance failed.");
    expect(result.value.p1_run_id).toHaveLength(36);
    return {
        p1_workspace_id,
        p1_run_id: result.value.p1_run_id,
        p1_source_event_id: result.value.p1_source_event_id,
        p1_correlation_id: result.value.p1_run_id,
    };
}

async function count_effects(p1_workspace_id: string) {
    return with_database_client(async (database_client) => {
        const result = await database_client.query<Record<string, number>>(
            `SELECT
            (SELECT count(*)::int FROM p1_source_events WHERE p1_workspace_id = $1) AS events,
            (SELECT count(*)::int FROM p1_simulated_crm_effects WHERE p1_workspace_id = $1) AS effects,
            (SELECT count(*)::int FROM p1_simulated_crm_customers WHERE p1_workspace_id = $1) AS customers,
            (SELECT count(*)::int FROM p1_synchronization_attempts WHERE p1_workspace_id = $1) AS attempts,
            (SELECT count(*)::int FROM p1_job.job WHERE name = 'p1_synchronization'
                AND data->>'p1_workspace_id' = $1::text) AS jobs`,
            [p1_workspace_id],
        );
        expect(result.rows).toHaveLength(1);
        return result.rows[0] ?? {};
    });
}
