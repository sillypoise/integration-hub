import { expect, test } from "@playwright/test";
import { z } from "zod";

const origin = "http://127.0.0.1:3100";

// Exercise the actual production build, HTTP authorization, queue, worker, and database together.
test("synchronizes a simulated event once and isolates inspection between visitors", async ({
    request,
    playwright,
}) => {
    expect((await request.post("/api/demo/workspaces", { headers: { origin } })).status()).toBe(
        201,
    );
    const data = { p1_customer_number: 1, p1_revision: 1 };
    const accepted = await request.post("/api/demo/events", { headers: { origin }, data });
    expect(accepted.status()).toBe(202);
    expect(accepted.headers()["cache-control"]).toBe("no-store");
    const result = z.object({ p1_run_id: z.uuid() }).parse(await accepted.json());
    const duplicate = await request.post("/api/demo/events", { headers: { origin }, data });
    expect(duplicate.status()).toBe(200);
    expect(await duplicate.json()).toMatchObject({ p1_run_id: result.p1_run_id, duplicate: true });
    await expect
        .poll(
            async () => {
                const response = await request.get(`/api/demo/runs/${result.p1_run_id}`);
                return z.object({ p1_state: z.string() }).parse(await response.json()).p1_state;
            },
            { timeout: 10_000, intervals: [100, 250, 500] },
        )
        .toBe("succeeded");
    const detail = await request.get(`/api/demo/runs/${result.p1_run_id}`);
    expect(await detail.json()).toMatchObject({
        p1_attempt_count: 1,
        p1_correlation_id: result.p1_run_id,
        p1_destination_mode: "simulated",
        p1_destination: { p1_email: "customer-1@example.test" },
        p1_attempts: [{ p1_attempt_number: 1, p1_state: "succeeded" }],
    });
    const list = await request.get("/api/demo/runs");
    expect(await list.json()).toMatchObject({ p1_runs: [{ p1_run_id: result.p1_run_id }] });
    const other = await playwright.request.newContext({ baseURL: origin });
    try {
        expect((await other.get(`/api/demo/runs/${result.p1_run_id}`)).status()).toBe(401);
        expect((await other.post("/api/demo/workspaces", { headers: { origin } })).status()).toBe(
            201,
        );
        expect((await other.get(`/api/demo/runs/${result.p1_run_id}`)).status()).toBe(404);
        expect(await (await other.get("/api/demo/runs")).json()).toMatchObject({ p1_runs: [] });
    } finally {
        await other.dispose();
    }
});

test("rejects unsafe event requests without creating runs", async ({ request }) => {
    expect((await request.post("/api/demo/workspaces", { headers: { origin } })).status()).toBe(
        201,
    );
    const denied = await request.post("/api/demo/events", { data: {} });
    expect(denied.status()).toBe(403);
    const invalid = await request.post("/api/demo/events", {
        headers: { origin },
        data: { p1_customer_number: 0, p1_revision: 1 },
    });
    expect(invalid.status()).toBe(400);
    expect(await invalid.json()).toMatchObject({ p1_fields: ["p1_customer_number"] });
    const raw_customer = await request.post("/api/demo/events", {
        headers: { origin },
        data: { p1_customer_number: 1, p1_revision: 1, p1_email: "private" },
    });
    expect(raw_customer.status()).toBe(400);
    const oversized = await request.post("/api/demo/events", {
        headers: { origin, "content-type": "application/json" },
        data: " ".repeat(16_385),
    });
    expect(oversized.status()).toBe(400);
    expect(await (await request.get("/api/demo/runs")).json()).toMatchObject({ p1_runs: [] });
});
