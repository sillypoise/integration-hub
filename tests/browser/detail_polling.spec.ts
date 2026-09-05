import { expect, test } from "@playwright/test";

const run_id = "10000000-0000-4000-8000-000000000001";
const detail = {
    p1_run_id: run_id,
    p1_correlation_id: run_id,
    p1_source_event_id: "10000000-0000-4000-8000-000000000002",
    p1_state: "queued",
    p1_delivery_state: "created",
    p1_attempt_count: 0,
    p1_created_at: "2026-01-01T00:00:00Z",
    p1_completed_at: null,
    p1_next_attempt_at: null,
    p1_destination_mode: "simulated",
    p1_destination: null,
    p1_attempts: [],
    p1_source: {
        p1_event_type: "commerce.customer.updated",
        p1_external_id: "customer_1",
        p1_updated_at: "2026-01-01T00:00:00Z",
    },
};

// Controlled responses and virtual time verify polling without manufacturing real worker delays.
test("polling stops at terminal success and on navigation", async ({ page }) => {
    await page.clock.install();
    let requests = 0;
    await page.route(`**/api/demo/runs/${run_id}`, async (route) => {
        requests += 1;
        await route.fulfill({
            json:
                requests === 1
                    ? detail
                    : {
                          ...detail,
                          p1_state: "succeeded",
                          p1_delivery_state: "completed",
                          p1_attempt_count: 1,
                      },
        });
    });
    await page.goto(`/demo/runs/${run_id}`);
    await expect(page.getByRole("heading", { name: "Your update is on its way" })).toBeVisible();
    await page.clock.runFor(2_100);
    await expect(page.getByRole("heading", { name: "Customer synchronized" })).toBeVisible();
    const terminal_count = requests;
    await page.clock.runFor(10_000);
    expect(requests).toBe(terminal_count);
    expect(terminal_count).toBe(2);
    await page.goto("/");
    await page.clock.runFor(5_000);
    expect(requests).toBe(terminal_count);
});

test("polling is bounded and stale views can be refreshed manually", async ({ page }) => {
    await page.clock.install();
    let requests = 0;
    await page.route(`**/api/demo/runs/${run_id}`, async (route) => {
        requests += 1;
        await route.fulfill({ json: detail });
    });
    await page.goto(`/demo/runs/${run_id}`);
    await expect(page.getByRole("heading", { name: "Your update is on its way" })).toBeVisible();
    await page.clock.runFor(60_100);
    await expect(page.getByText("Live updates paused", { exact: true })).toBeVisible();
    const stopped_count = requests;
    expect(stopped_count).toBeGreaterThan(1);
    expect(stopped_count).toBeLessThanOrEqual(30);
    await page.clock.runFor(5_000);
    expect(requests).toBe(stopped_count);
    await page.getByRole("button", { name: "Refresh run" }).click();
    await expect(page.getByText("Live updates paused", { exact: true })).toHaveCount(0);
    expect(requests).toBe(stopped_count + 1);
    await page.goto("/");
    const navigation_count = requests;
    await page.clock.runFor(10_000);
    expect(requests).toBe(navigation_count);
});

test("missing or stopped delivery is not presented as success", async ({ page }) => {
    await page.route(`**/api/demo/runs/${run_id}`, async (route) => {
        await route.fulfill({ json: { ...detail, p1_delivery_state: "failed" } });
    });
    await page.goto(`/demo/runs/${run_id}`);
    await expect(page.getByText("Delivery stopped", { exact: true })).toBeVisible();
    await expect(page.getByText("Auto-refresh stopped", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Customer synchronized" })).toHaveCount(0);
    await page.route(`**/api/demo/runs/${run_id}`, async (route) => {
        await route.fulfill({ status: 404, json: { code: "RESOURCE_NOT_FOUND" } });
    });
    await page.getByRole("button", { name: "Refresh run" }).click();
    await expect(page.getByRole("heading", { name: "Run not available" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Execution timeline" })).toHaveCount(0);
    await expect(page.getByText("Live updates paused", { exact: true })).toHaveCount(0);
});
