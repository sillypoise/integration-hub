import assert from "node:assert/strict";
import { Client, type ClientBase } from "pg";

import { read_server_environment } from "../config/server_environment.ts";

export async function with_database_client<Result>(
    operation: (database_client: ClientBase) => Promise<Result>,
): Promise<Result> {
    assert.equal(typeof operation, "function");
    assert.equal(typeof process.env.DATABASE_URL, "string");

    const environment = read_server_environment(process.env);
    const database_ssl =
        environment.DATABASE_SSL === "verify-full" ? { rejectUnauthorized: true } : false;
    const database_client = new Client({
        application_name: "p1_integration_hub_application",
        connectionString: environment.DATABASE_URL,
        connectionTimeoutMillis: 5_000,
        keepAlive: true,
        keepAliveInitialDelayMillis: 5_000,
        query_timeout: 5_000,
        statement_timeout: 5_000,
        ssl: database_ssl,
    });

    try {
        await database_client.connect();
        return await operation(database_client);
    } finally {
        await database_client.end();
    }
}
