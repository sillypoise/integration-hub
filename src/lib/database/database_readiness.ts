import assert from "node:assert/strict";
import { Client } from "pg";

import { read_server_environment } from "../config/server_environment.ts";
import { application_logger } from "../observability/application_logger.ts";

export async function check_database_readiness(): Promise<boolean> {
    const environment = read_server_environment(process.env);
    const database_ssl =
        environment.DATABASE_SSL === "verify-full" ? { rejectUnauthorized: true } : false;
    const database_client = new Client({
        application_name: "p1_integration_hub_readiness",
        connectionString: environment.DATABASE_URL,
        connectionTimeoutMillis: 2_000,
        keepAlive: true,
        keepAliveInitialDelayMillis: 2_000,
        query_timeout: 2_000,
        statement_timeout: 2_000,
        ssl: database_ssl,
    });
    let database_ready = false;

    try {
        await database_client.connect();
        const result = await database_client.query<{ p1_ready: number }>({
            name: "p1_readiness",
            text: "SELECT 1 AS p1_ready",
            values: [],
        });

        assert.equal(result.rowCount, 1);
        assert.equal(result.rows[0]?.p1_ready, 1);
        database_ready = true;
    } catch (error: unknown) {
        const error_type = error instanceof Error ? error.name : "UnknownError";
        application_logger.error({ error_type }, "Readiness database check failed.");
    }

    try {
        await database_client.end();
    } catch (error: unknown) {
        const error_type = error instanceof Error ? error.name : "UnknownError";
        application_logger.error({ error_type }, "Readiness database cleanup failed.");
        database_ready = false;
    }

    assert.equal(typeof database_ready, "boolean");
    return database_ready;
}
