import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { with_database_client } from "../database/database_client.ts";
import { accept_p1_source_event } from "../synchronization/synchronization_repository.ts";
import { create_p1_simulated_customer_event } from "../simulators/commerce_simulator.ts";
import { mutate_p1_recovery } from "../synchronization/recovery_repository.ts";
import { create_p1_demo_workspace } from "./workspace_repository.ts";
import { consume_p1_demo_budget } from "./demo_budget.ts";
import * as queue from "../jobs/synchronization_queue.ts";

// Actual database locks couple admissions to commits; resets cannot mint fresh event authority.
beforeEach(reset_budgets);
afterEach(async () => {
    vi.restoreAllMocks();
    await reset_budgets();
});
it("admits only one concurrent event at the global boundary and preserves safe replay", async () => {
    const workspace = await require_workspace();
    await set_budget("events", 1_999);
    const results = await Promise.all([1, 2].map((revision) => accept_event(workspace, revision)));
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([
        { ok: false, code: "DEMO_BUDGET_REACHED" },
    ]);
    expect(await count_budget("events")).toBe(2_000);
    const accepted_revision = results[0]?.ok ? 1 : 2;
    expect(await accept_event(workspace, accepted_revision)).toMatchObject({
        ok: true,
        value: { duplicate: true },
    });
    expect(await count_budget("events")).toBe(2_000);
});
it("denies creation at its durable budget and recovers when the 24-hour window expires", async () => {
    await set_budget("workspaces", 200);
    expect(await create_p1_demo_workspace({ current_time: new Date() })).toEqual({
        ok: false,
        code: "DEMO_BUDGET_REACHED",
    });
    await with_database_client((client) =>
        client.query(
            "UPDATE p1_demo_budgets SET p1_window_started_at = now() - interval '24 hours' WHERE p1_resource = 'workspaces'",
        ),
    );
    expect((await create_p1_demo_workspace({ current_time: new Date() })).ok).toBe(true);
    expect(await count_budget("workspaces")).toBe(1);
});
it("rolls back the global admission when durable enqueue fails", async () => {
    const workspace = await require_workspace();
    vi.spyOn(queue, "enqueue_p1_synchronization").mockRejectedValueOnce(
        new Error("Injected enqueue failure."),
    );
    await expect(accept_event(workspace, 1)).rejects.toThrow("Injected enqueue failure.");
    expect(await count_budget("events")).toBe(0);
});
it("preserves lifetime and global limits across reset, but still permits retained duplicates", async () => {
    const workspace = await require_workspace();
    await accept_event(workspace, 1);
    await with_database_client((client) =>
        client.query(
            `INSERT INTO p1_audit_events (p1_workspace_id, p1_action, p1_resource_type, p1_resource_id)
         SELECT $1, 'event_accepted', 'source_event', gen_random_uuid() FROM generate_series(1, 999)`,
            [workspace],
        ),
    );
    expect(await accept_event(workspace, 1)).toMatchObject({
        ok: true,
        value: { duplicate: true },
    });
    expect(await accept_event(workspace, 2)).toEqual({ ok: false, code: "EVENT_LIMIT_REACHED" });
    expect(
        await mutate_p1_recovery(workspace, { action: "reset", p1_request_id: randomUUID() }),
    ).toBe("WORKSPACE_RESET");
    expect(await accept_event(workspace, 1)).toEqual({ ok: false, code: "EVENT_LIMIT_REACHED" });
    expect(await count_budget("events")).toBe(1);
});
it("fails closed when a budget row is missing and rejects database quota corruption", async () => {
    await with_database_client(async (client) => {
        await client.query("BEGIN");
        try {
            await client.query("DELETE FROM p1_demo_budgets WHERE p1_resource = 'events'");
            expect(await consume_p1_demo_budget(client, "events")).toBe(false);
        } finally {
            await client.query("ROLLBACK");
        }
    });
    await expect(set_budget("events", 2_001)).rejects.toMatchObject({ code: "23514" });
    await expect(set_budget("workspaces", 201)).rejects.toMatchObject({ code: "23514" });
    await expect(set_budget("events", -1)).rejects.toMatchObject({ code: "23514" });
});
async function require_workspace() {
    const result = await create_p1_demo_workspace({ current_time: new Date() });
    if (!result.ok) throw new Error("Expected workspace.");
    expect(result.p1_workspace_id).toHaveLength(36);
    return result.p1_workspace_id;
}
function accept_event(workspace: string, revision: number) {
    return accept_p1_source_event(
        create_p1_simulated_customer_event({ p1_customer_number: 1, p1_revision: revision }),
        {
            current_time: new Date(),
            p1_workspace_id: workspace,
        },
    );
}
async function reset_budgets() {
    expect(process.env.NODE_ENV).toBe("test");
    await with_database_client((client) =>
        client.query(
            "UPDATE p1_demo_budgets SET p1_count = 0, p1_window_started_at = clock_timestamp()",
        ),
    );
}
async function set_budget(resource: "events" | "workspaces", count: number) {
    await with_database_client((client) =>
        client.query("UPDATE p1_demo_budgets SET p1_count = $2 WHERE p1_resource = $1", [
            resource,
            count,
        ]),
    );
}
async function count_budget(resource: "events" | "workspaces") {
    const result = await with_database_client((client) =>
        client.query<{ p1_count: number }>(
            "SELECT p1_count FROM p1_demo_budgets WHERE p1_resource = $1",
            [resource],
        ),
    );
    return result.rows[0]?.p1_count;
}
