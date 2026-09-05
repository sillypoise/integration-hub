import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { p1_overview_view } from "../contracts/demo_views.ts";
import { with_database_client } from "../database/database_client.ts";
import { create_p1_simulated_customer_event } from "../simulators/commerce_simulator.ts";
import { create_p1_demo_workspace } from "../workspaces/workspace_repository.ts";
import { accept_p1_source_event } from "./synchronization_repository.ts";
import { read_p1_overview } from "./overview_repository.ts";

// Controlled database fixtures cover every aggregate category and its delivery-state precedence.
it("counts scoped outcomes and returns no more than six recent runs", async () => {
    const workspace = await create_p1_demo_workspace({ current_time: new Date() });
    if (!workspace.ok) throw new Error("Expected workspace.");
    const states = [
        "succeeded",
        "queued",
        "processing",
        "terminal_failure",
        "retryable_failure",
        "queued",
        "queued",
        "succeeded",
    ];
    const base_time = Date.now();
    const runs = await Promise.all(
        states.map(async (_, index) => {
            const accepted = await accept_p1_source_event(
                create_p1_simulated_customer_event({
                    p1_customer_number: index + 1,
                    p1_revision: 1,
                }),
                {
                    current_time: new Date(base_time + index),
                    p1_workspace_id: workspace.p1_workspace_id,
                },
            );
            if (!accepted.ok) throw new Error("Expected event.");
            return accepted.value.p1_run_id;
        }),
    );
    await with_database_client(async (client) => {
        await client.query(
            `UPDATE p1_synchronization_runs AS p1_run
            SET p1_state = p1_fixture.p1_state FROM unnest($1::uuid[], $2::text[])
            AS p1_fixture(p1_id, p1_state) WHERE p1_run.p1_id = p1_fixture.p1_id`,
            [runs, states],
        );
        await client.query(
            `UPDATE p1_job.job SET state = 'failed'
            WHERE name = 'p1_synchronization' AND id = ANY($1::uuid[])`,
            [[runs[5], runs[6], runs[7]]],
        );
    });
    const result = p1_overview_view.parse({
        ...(await read_p1_overview(workspace.p1_workspace_id)),
        p1_expires_at: workspace.p1_expires_at.toISOString(),
    });
    expect(result).toMatchObject({ p1_total: 8, p1_succeeded: 2, p1_pending: 2, p1_attention: 4 });
    expect(result.p1_recent).toHaveLength(6);
    expect(result.p1_recent.map((run) => run.p1_run_id)).toEqual(runs.toReversed().slice(0, 6));
    expect(await read_p1_overview(randomUUID())).toMatchObject({ p1_total: 0, p1_recent: [] });
    await with_database_client(async (client) => {
        await client.query(
            `UPDATE p1_demo_workspaces SET p1_created_at = now() - interval '2 days',
            p1_expires_at = now() - interval '1 day' WHERE p1_id = $1`,
            [workspace.p1_workspace_id],
        );
    });
    expect(await read_p1_overview(workspace.p1_workspace_id)).toMatchObject({
        p1_total: 0,
        p1_recent: [],
    });
});

it("rejects malformed workspace identifiers before database access", async () => {
    await expect(read_p1_overview("not-a-uuid")).rejects.toThrow(/Invalid/u);
});
