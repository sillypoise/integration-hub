import assert from "node:assert/strict";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clear_test_synchronization_jobs } from "../src/lib/jobs/test_queue_setup.ts";
import { start_job_runtime, stop_job_runtime } from "../src/lib/jobs/job_runtime.ts";
import { create_p1_demo_workspace } from "../src/lib/workspaces/workspace_repository.ts";
import { with_database_client } from "../src/lib/database/database_client.ts";
import * as queue from "../src/lib/jobs/synchronization_queue.ts";
import { parse_stripe_fixture } from "./stripe_source.ts";
import { synchronize_stripe_fixture } from "./stripe_sync.ts";
import { test_customer, test_probe } from "./stripe_test_fixture.ts";

beforeEach(clear_test_synchronization_jobs);
afterEach(async () => {
    vi.restoreAllMocks();
    await stop_job_runtime();
});

// A provider-shaped fixture enters the real queue/worker. An enqueue failure must roll back before
// retry/replay converge on one immutable event, run, destination customer, and effect.
it("recovers local failure and converges repeated source execution", async () => {
    const source = parse_stripe_fixture(test_customer(), test_probe);
    assert.ok(source);
    const workspace = await create_p1_demo_workspace({ current_time: new Date() });
    assert.ok(workspace.ok);
    const enqueue = vi
        .spyOn(queue, "enqueue_p1_synchronization")
        .mockRejectedValueOnce(new Error("Injected local failure."));
    await expect(synchronize_stripe_fixture(source, workspace.p1_workspace_id)).rejects.toThrow(
        "Injected local failure.",
    );
    expect(await stripe_sync_counts(workspace.p1_workspace_id)).toEqual([0, 0, 0, 0]);
    enqueue.mockRestore();
    await start_job_runtime();
    const run = await synchronize_stripe_fixture(source, workspace.p1_workspace_id);
    expect(await synchronize_stripe_fixture(source, workspace.p1_workspace_id)).toBe(run);
    expect(await stripe_sync_counts(workspace.p1_workspace_id)).toEqual([1, 1, 1, 1]);
}, 15000);

async function stripe_sync_counts(workspace_id: string): Promise<number[]> {
    return with_database_client(async (client) => {
        const result = await client.query<{
            events: number;
            runs: number;
            customers: number;
            effects: number;
        }>(
            `SELECT
                (SELECT count(*)::integer FROM p1_source_events
                    WHERE p1_workspace_id = $1) AS events,
                (SELECT count(*)::integer FROM p1_synchronization_runs
                    WHERE p1_workspace_id = $1) AS runs,
                (SELECT count(*)::integer FROM p1_simulated_crm_customers
                    WHERE p1_workspace_id = $1) AS customers,
                (SELECT count(*)::integer FROM p1_simulated_crm_effects
                    WHERE p1_workspace_id = $1) AS effects`,
            [workspace_id],
        );
        assert.equal(result.rowCount, 1);
        const row = result.rows[0];
        assert.ok(row);
        return [row.events, row.runs, row.customers, row.effects];
    });
}
