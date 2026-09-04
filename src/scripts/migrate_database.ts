import assert from "node:assert/strict";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { read_server_environment } from "../lib/config/server_environment.ts";
import { application_logger } from "../lib/observability/application_logger.ts";

const environment = read_server_environment(process.env);
const database_ssl =
    environment.DATABASE_SSL === "verify-full" ? { rejectUnauthorized: true } : false;
const migration_pool = new Pool({
    allowExitOnIdle: false,
    application_name: "p1_integration_hub_migrations",
    connectionString: environment.DATABASE_URL,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 5_000,
    max: 1,
    min: 0,
    query_timeout: 10_000,
    statement_timeout: 10_000,
    ssl: database_ssl,
});

try {
    assert.equal(migration_pool.totalCount, 0);
    assert.equal(migration_pool.idleCount, 0);

    await migrate(drizzle(migration_pool), {
        migrationsFolder: "drizzle",
        migrationsSchema: "p1_migrations",
        migrationsTable: "p1_drizzle_migrations",
    });

    application_logger.info("Database migrations completed.");
} catch (error: unknown) {
    const error_type = error instanceof Error ? error.name : "UnknownError";
    application_logger.fatal({ error_type }, "Database migrations failed.");
    process.exitCode = 1;
} finally {
    await migration_pool.end();
}
