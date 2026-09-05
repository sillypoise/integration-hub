import { spawn } from "node:child_process";
import { once } from "node:events";
import { expect, it, vi } from "vitest";

import { with_database_client } from "../database/database_client.ts";
import { start_job_runtime, stop_job_runtime } from "../jobs/job_runtime.ts";
import { clear_test_synchronization_jobs } from "../jobs/test_queue_setup.ts";
import { create_p1_simulated_customer_event } from "../simulators/commerce_simulator.ts";
import { create_p1_demo_workspace } from "../workspaces/workspace_repository.ts";
import {
    accept_p1_source_event,
    find_p1_synchronization_run,
} from "./synchronization_repository.ts";

// Hold the destination table lock until a separate Node process reaches its effect write.
// SIGKILL then verifies actual connection-loss rollback, not just a mocked exception.
it("recovers accepted work after a processor is killed before its transaction commits", async () => {
    const job = await create_interruption_job();
    await with_database_client(async (lock_client) => {
        await lock_client.query("BEGIN");
        await lock_client.query("LOCK TABLE p1_simulated_crm_effects IN ACCESS EXCLUSIVE MODE");
        const child = spawn(
            process.execPath,
            [
                "--input-type=module",
                "-e",
                `
            import { process_p1_synchronization } from './src/lib/synchronization/synchronization_worker.ts';
            await process_p1_synchronization(${JSON.stringify(job)});
        `,
            ],
            { env: process.env, stdio: "ignore" },
        );
        const exited = once(child, "exit");
        try {
            await vi.waitFor(
                async () => {
                    const blocked = await with_database_client(async (observer) =>
                        observer.query(
                            `SELECT count(*)::int AS p1_count FROM pg_stat_activity
                     WHERE application_name = 'p1_integration_hub_application'
                       AND wait_event_type = 'Lock'
                       AND query LIKE '%INSERT INTO p1_simulated_crm_effects%'`,
                        ),
                    );
                    expect(blocked.rows[0]?.p1_count).toBe(1);
                },
                { interval: 50, timeout: 3_000 },
            );
        } finally {
            child.kill("SIGKILL");
            await exited;
            await lock_client.query("ROLLBACK");
        }
    });
    expect(await find_p1_synchronization_run(job)).toEqual({
        p1_state: "queued",
        p1_attempt_count: 0,
    });
    const counts = await with_database_client(async (database_client) =>
        database_client.query(
            `SELECT (SELECT count(*)::int FROM p1_simulated_crm_effects WHERE p1_run_id = $1)
            AS p1_effects,
            (SELECT count(*)::int FROM p1_synchronization_attempts WHERE p1_run_id = $1)
            AS p1_attempts`,
            [job.p1_run_id],
        ),
    );
    expect(counts.rows[0]).toEqual({ p1_effects: 0, p1_attempts: 0 });
    try {
        await start_job_runtime();
        await vi.waitFor(
            async () => {
                expect(await find_p1_synchronization_run(job)).toEqual({
                    p1_state: "succeeded",
                    p1_attempt_count: 1,
                });
            },
            { interval: 100, timeout: 10_000 },
        );
    } finally {
        await stop_job_runtime();
    }
}, 20_000);

async function create_interruption_job() {
    await clear_test_synchronization_jobs();
    const workspace = await create_p1_demo_workspace({ current_time: new Date() });
    if (!workspace.ok) throw new Error("Workspace creation failed.");
    const accepted = await accept_p1_source_event(
        create_p1_simulated_customer_event({
            p1_customer_number: 1,
            p1_revision: 1,
        }),
        { p1_workspace_id: workspace.p1_workspace_id, current_time: new Date() },
    );
    if (!accepted.ok) throw new Error("Event acceptance failed.");
    return {
        p1_workspace_id: workspace.p1_workspace_id,
        p1_run_id: accepted.value.p1_run_id,
        p1_source_event_id: accepted.value.p1_source_event_id,
        p1_correlation_id: accepted.value.p1_run_id,
    };
}
