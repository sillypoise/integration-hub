import assert from "node:assert/strict";
import { Pool } from "pg";

import { read_server_environment } from "../config/server_environment.ts";
import { application_logger } from "../observability/application_logger.ts";

const environment = read_server_environment(process.env);
const database_ssl =
    environment.DATABASE_SSL === "verify-full" ? { rejectUnauthorized: true } : false;

export const database_pool = new Pool({
    allowExitOnIdle: false,
    application_name: "p1_integration_hub_web",
    connectionString: environment.DATABASE_URL,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    max: 5,
    maxLifetimeSeconds: 300,
    min: 0,
    query_timeout: 2_000,
    statement_timeout: 2_000,
    ssl: database_ssl,
});

database_pool.on("error", (error: Error) => {
    assert.ok(error instanceof Error);
    assert.ok(error.name.length > 0);
    application_logger.error({ error_type: error.name }, "Idle database client failed.");
});

export async function close_database_pool(): Promise<void> {
    assert.ok(database_pool.totalCount >= 0);
    assert.ok(database_pool.idleCount >= 0);

    await database_pool.end();

    assert.equal(database_pool.totalCount, 0);
    assert.equal(database_pool.idleCount, 0);
}
