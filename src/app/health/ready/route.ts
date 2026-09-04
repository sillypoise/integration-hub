import assert from "node:assert/strict";

import { database_pool } from "../../../lib/database/database_pool.ts";
import { application_logger } from "../../../lib/observability/application_logger.ts";

const ready_response_body = JSON.stringify({ status: "ready" });
const unavailable_response_body = JSON.stringify({ code: "DEPENDENCY_UNAVAILABLE" });
const response_headers = {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
};

export async function GET(): Promise<Response> {
    try {
        const result = await database_pool.query<{ p1_ready: number }>({
            name: "p1_readiness",
            text: "SELECT 1 AS p1_ready",
            values: [],
        });

        assert.equal(result.rowCount, 1);
        assert.equal(result.rows[0]?.p1_ready, 1);

        return new Response(ready_response_body, {
            headers: response_headers,
            status: 200,
        });
    } catch (error: unknown) {
        const error_type = error instanceof Error ? error.name : "UnknownError";
        application_logger.error({ error_type }, "Readiness database check failed.");

        return new Response(unavailable_response_body, {
            headers: response_headers,
            status: 503,
        });
    }
}
