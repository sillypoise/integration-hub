import assert from "node:assert/strict";
import { PgBoss } from "pg-boss";
import { z } from "zod";

import { read_server_environment } from "../config/server_environment.ts";
import { application_logger } from "../observability/application_logger.ts";
import {
    cleanup_expired_p1_demo_workspaces,
    p1_workspace_cleanup_batch_limit,
} from "../workspaces/workspace_repository.ts";

const diagnostic_queue_name = "p1_diagnostic";
const workspace_cleanup_queue_name = "p1_workspace_cleanup";
const diagnostic_payload_schema = z.object({
    p1_delay_ms: z.number().int().min(0).max(5_000),
    p1_probe_id: z.uuid(),
});

let job_boss: PgBoss | null = null;

export async function start_job_runtime(): Promise<void> {
    assert.equal(job_boss, null);
    assert.ok(diagnostic_queue_name.startsWith("p1_"));

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

    next_job_boss.on("error", (error: Error) => {
        application_logger.error({ error_type: error.name }, "Job runtime failed.");
    });
    next_job_boss.on("warning", (warning) => {
        application_logger.warn({ warning_type: warning.message }, "Job runtime warning.");
    });

    await next_job_boss.start();
    const schema_drift = await next_job_boss.detectSchemaDrift();
    assert.equal(schema_drift.ok, true);

    await start_job_runtime_register_diagnostic_queue(next_job_boss);
    await start_job_runtime_register_workspace_cleanup_queue(next_job_boss);

    job_boss = next_job_boss;
    assert.ok(job_boss instanceof PgBoss);
    assert.equal(job_boss.getWipData().length, 2);
}

export async function stop_job_runtime(): Promise<void> {
    const active_job_boss = job_boss;

    if (active_job_boss === null) {
        return;
    }

    assert.ok(active_job_boss instanceof PgBoss);
    assert.ok(active_job_boss.getWipData().length <= 2);

    job_boss = null;
    await active_job_boss.stop({ close: true, graceful: true, timeout: 10_000 });

    assert.equal(job_boss, null);
}

export async function send_diagnostic_job(
    input: Readonly<{ p1_delay_ms: number; p1_probe_id: string }>,
    start_after_seconds: number,
): Promise<string> {
    assert.ok(start_after_seconds >= 0);
    assert.ok(start_after_seconds <= 30);

    const active_job_boss = job_boss;
    assert.ok(active_job_boss instanceof PgBoss);

    const payload = diagnostic_payload_schema.parse(input);
    const job_id = await active_job_boss.send(diagnostic_queue_name, payload, {
        deleteAfterSeconds: 3_600,
        expireInSeconds: 10,
        retentionSeconds: 3_600,
        retryBackoff: false,
        retryDelay: 1,
        retryLimit: 1,
        singletonKey: payload.p1_probe_id,
        startAfter: start_after_seconds,
    });

    assert.ok(typeof job_id === "string");
    assert.ok(job_id.length > 0);

    return job_id;
}

export async function find_diagnostic_job(job_id: string) {
    assert.ok(job_id.length > 0);
    assert.ok(job_id.length <= 100);

    const active_job_boss = job_boss;
    assert.ok(active_job_boss instanceof PgBoss);

    const jobs = await active_job_boss.findJobs(diagnostic_queue_name, { id: job_id });
    assert.ok(jobs.length <= 1);

    return jobs[0] ?? null;
}

async function start_job_runtime_register_diagnostic_queue(job_boss_to_register: PgBoss) {
    assert.ok(job_boss_to_register instanceof PgBoss);
    assert.ok(diagnostic_queue_name.startsWith("p1_"));

    await job_boss_to_register.createQueue(diagnostic_queue_name, {
        deleteAfterSeconds: 3_600,
        expireInSeconds: 10,
        notify: false,
        partition: false,
        policy: "standard",
        retentionSeconds: 3_600,
        retryBackoff: false,
        retryDelay: 1,
        retryLimit: 1,
        warningQueueSize: 100,
    });
    await job_boss_to_register.work(
        diagnostic_queue_name,
        {
            batchSize: 1,
            burstWhenBatchFull: false,
            includeMetadata: false,
            localConcurrency: 1,
            pollingIntervalSeconds: 0.5,
        },
        job_runtime_handle_diagnostic_jobs,
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

async function job_runtime_handle_diagnostic_jobs(
    jobs: ReadonlyArray<{ data: unknown; id: string }>,
): Promise<{ p1_processed: true }> {
    assert.equal(jobs.length, 1);
    assert.ok(jobs[0]?.id.length);

    const payload = diagnostic_payload_schema.parse(jobs[0]?.data);

    if (payload.p1_delay_ms > 0) {
        await new Promise<void>((resolve) => {
            setTimeout(resolve, payload.p1_delay_ms);
        });
    }

    application_logger.info(
        { job_id: jobs[0]?.id, probe_id: payload.p1_probe_id },
        "Diagnostic job completed.",
    );

    return { p1_processed: true };
}
