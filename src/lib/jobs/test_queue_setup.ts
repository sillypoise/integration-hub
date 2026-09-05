import assert from "node:assert/strict";
import { with_database_client } from "../database/database_client.ts";
import { start_job_runtime, stop_job_runtime } from "./job_runtime.ts";

// PostgreSQL integration tests exercise transactional sends with workers stopped unless requested.
export default async function setup_test_queues(): Promise<void> {
    await start_job_runtime();
    await stop_job_runtime();
    await clear_test_synchronization_jobs();
}

export async function clear_test_synchronization_jobs(): Promise<void> {
    assert.equal(process.env.NODE_ENV, "test");
    // Integration tests already reset domain tables; queue cleanup prevents stale fixtures
    // from occupying the single worker ahead of the case whose deadline is being tested.
    await with_database_client(async (database_client) => {
        await database_client.query("DELETE FROM p1_job.job WHERE name = 'p1_synchronization'");
    });
}
