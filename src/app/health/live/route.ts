import assert from "node:assert/strict";

const response_body = JSON.stringify({ status: "ok" });

export function GET(): Response {
    assert.ok(response_body.length > 0);
    assert.equal(response_body.includes("ok"), true);

    const response = new Response(response_body, {
        headers: {
            "cache-control": "no-store",
            "content-type": "application/json; charset=utf-8",
        },
        status: 200,
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");

    return response;
}
