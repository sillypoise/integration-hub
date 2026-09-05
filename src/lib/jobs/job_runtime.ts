import assert from "node:assert/strict";
import { PgBoss } from "pg-boss";

import { read_server_environment } from "../config/server_environment.ts";
import { p1_synchronization_job_schema } from "../contracts/synchronization_contracts.ts";
import { application_logger } from "../observability/application_logger.ts";
import { process_p1_synchronization } from "../synchronization/synchronization_worker.ts";
import {
    cleanup_expired_p1_demo_workspaces,
    p1_workspace_cleanup_batch_limit,
} from "../workspaces/workspace_repository.ts";
import {
    p1_synchronization_queue_name,
    p1_synchronization_queue_options,
} from "./synchronization_queue.ts";

const workspace_cleanup_queue_name = "p1_workspace_cleanup";
let job_boss: PgBoss | null = null;

export async function start_job_runtime(): Promise<void> {
    assert.equal(job_boss, null);
    assert.ok(p1_synchronization_queue_name.startsWith("p1_"));
    const environment = read_server_environment(process.env);
    const database_ssl =
        environment.DATABASE_SSL === "verify-full" ? { rejectUnauthorized: true } : false;
    const next_job_boss = new PgBoss({
        application_name: "p1_integration_hub_jobs",
        backend: "postgres",
        connectionString: environment.DATABASE_URL,
        connectionTimeoutMillis: 5_000,
        createSchema: true,
        max: 4,
        migrate: true,
        persistQueueStats: false,
        persistWarnings: false,
        reindex: false,
        schedule: true,
        schema: "p1_job",
        ssl: database_ssl,
        supervise: true,
        useListenNotify: false,
    });
    next_job_boss.on("error", () => {
        application_logger.error({}, "Job runtime failed.");
    });
    next_job_boss.on("warning", () => {
        application_logger.warn({}, "Job runtime warning.");
    });
    try {
        await next_job_boss.start();
        const schema_drift = await next_job_boss.detectSchemaDrift();
        assert.equal(schema_drift.ok, true);
        await start_job_runtime_register_synchronization_queue(next_job_boss);
        await start_job_runtime_register_workspace_cleanup_queue(next_job_boss);
        job_boss = next_job_boss;
        assert.equal(job_boss.getWipData().length, 2);
    } catch (error: unknown) {
        await next_job_boss.stop({ close: true, graceful: true, timeout: 10_000 });
        throw error;
    }
}

export async function stop_job_runtime(): Promise<void> {
    const active_job_boss = job_boss;
    if (active_job_boss === null) return;
    assert.ok(active_job_boss instanceof PgBoss);
    assert.ok(active_job_boss.getWipData().length <= 2);
    job_boss = null;
    await active_job_boss.stop({ close: true, graceful: true, timeout: 10_000 });
    assert.equal(job_boss, null);
}

async function start_job_runtime_register_synchronization_queue(job_boss_to_register: PgBoss) {
    assert.ok(job_boss_to_register instanceof PgBoss);
    assert.ok(p1_synchronization_queue_name.startsWith("p1_"));
    await job_boss_to_register.createQueue(
        p1_synchronization_queue_name,
        p1_synchronization_queue_options,
    );
    await job_boss_to_register.work(
        p1_synchronization_queue_name,
        {
            batchSize: 1,
            burstWhenBatchFull: false,
            includeMetadata: false,
            localConcurrency: 1,
            pollingIntervalSeconds: 0.5,
        },
        job_runtime_handle_synchronization_jobs,
    );
}

async function start_job_runtime_register_workspace_cleanup_queue(job_boss_to_register: PgBoss) {
    assert.ok(job_boss_to_register instanceof PgBoss);
    assert.ok(workspace_cleanup_queue_name.startsWith("p1_"));
    await job_boss_to_register.createQueue(workspace_cleanup_queue_name, {
        deleteAfterSeconds: 3_600,
        expireInSeconds: 30,
        notify: false,
        partition: false,
        policy: "singleton",
        retentionSeconds: 3_600,
        retryBackoff: false,
        retryDelay: 60,
        retryLimit: 2,
        warningQueueSize: 10,
    });
    await job_boss_to_register.schedule(
        workspace_cleanup_queue_name,
        "0 * * * *",
        {},
        {
            deleteAfterSeconds: 3_600,
            expireInSeconds: 30,
            key: "p1_hourly_workspace_cleanup",
            retentionSeconds: 3_600,
            retryBackoff: false,
            retryDelay: 60,
            retryLimit: 2,
            singletonKey: "p1_hourly_workspace_cleanup",
            tz: "Etc/UTC",
        },
    );
    await job_boss_to_register.work(
        workspace_cleanup_queue_name,
        {
            batchSize: 1,
            burstWhenBatchFull: false,
            includeMetadata: false,
            localConcurrency: 1,
            pollingIntervalSeconds: 30,
        },
        job_runtime_handle_workspace_cleanup_jobs,
    );
}

async function job_runtime_handle_workspace_cleanup_jobs(
    jobs: ReadonlyArray<{ data: unknown; id: string }>,
): Promise<{ p1_deleted_count: number }> {
    assert.equal(jobs.length, 1);
    assert.ok(jobs[0]?.id.length);
    const deleted_count = await cleanup_expired_p1_demo_workspaces({
        batch_limit: p1_workspace_cleanup_batch_limit,
        current_time: new Date(),
    });
    assert.ok(deleted_count >= 0);
    assert.ok(deleted_count <= p1_workspace_cleanup_batch_limit);
    application_logger.info({ deleted_count }, "Expired workspace cleanup completed.");
    return { p1_deleted_count: deleted_count };
}

async function job_runtime_handle_synchronization_jobs(
    jobs: ReadonlyArray<{ data: unknown; id: string }>,
): Promise<{ p1_outcome: string }> {
    assert.equal(jobs.length, 1);
    assert.ok(jobs[0]?.id.length);
    try {
        const payload = p1_synchronization_job_schema.parse(jobs[0]?.data);
        const outcome = await process_p1_synchronization(payload);
        application_logger.info(
            { job_id: jobs[0]?.id, p1_correlation_id: payload.p1_correlation_id, outcome },
            "Synchronization job completed.",
        );
        return { p1_outcome: outcome };
    } catch {
        // pg-boss persists thrown errors; never pass SQL or validation payloads to its output.
        application_logger.error({ job_id: jobs[0]?.id }, "Synchronization job failed.");
        throw new Error("Synchronization job failed.");
    }
}
