import assert from "node:assert/strict";

import { check_database_readiness } from "../../../lib/database/database_readiness.ts";

const ready_response_body = JSON.stringify({ status: "ready" });
const unavailable_response_body = JSON.stringify({ code: "DEPENDENCY_UNAVAILABLE" });
const response_headers = {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
};

export async function GET(): Promise<Response> {
    const database_ready = await check_database_readiness();

    assert.equal(typeof database_ready, "boolean");
    assert.ok(ready_response_body.length > 0);

    if (database_ready) {
        return new Response(ready_response_body, {
            headers: response_headers,
            status: 200,
        });
    }

    return new Response(unavailable_response_body, {
        headers: response_headers,
        status: 503,
    });
}
