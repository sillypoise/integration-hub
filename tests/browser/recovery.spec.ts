import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { p1_run_detail_view } from "../../src/lib/contracts/demo_views.ts";

// Real timers, PostgreSQL, and worker on both viewports: no mocked success or retry transitions.
test("a persistent outage exhausts visibly, admits one restoration, then resets safely", async ({
    page,
}, info) => {
    test.setTimeout(45_000);
    await open_scenario(page, "persistent_outage");
    await expect(page.getByText(/Next attempt not before/u)).toBeVisible({ timeout: 5_000 });
    await page.screenshot({ path: info.outputPath("retry-scheduled.png"), fullPage: true });
    await expect(page.getByRole("heading", { name: "Automatic retries exhausted" })).toBeVisible({
        timeout: 22_000,
    });
    await expect(page.locator(".timeline li").filter({ hasText: /Attempt [123]/u })).toHaveCount(3);
    await expect(page.getByText("No destination effect has been recorded yet.")).toBeVisible();
    await page.screenshot({ path: info.outputPath("exhausted.png"), fullPage: true });
    const checkbox = page.getByRole("checkbox", {
        name: "Restore the simulator for this run and retry.",
    });
    await page.getByRole("button", { name: "Restore simulator & retry" }).click();
    await expect(checkbox).toBeFocused();
    await checkbox.check();
    await page.getByRole("button", { name: "Restore simulator & retry" }).click();
    await expect(page.getByRole("heading", { name: "Customer synchronized" })).toBeVisible({
        timeout: 8_000,
    });
    await expect(page.getByText("Attempt 4 · succeeded", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Restore simulator & retry" })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
    );
    await page.screenshot({ path: info.outputPath("restored.png"), fullPage: true });
    const run_url = page.url();
    await page.getByRole("link", { name: "Demo controls", exact: true }).click();
    await page
        .getByRole("checkbox", { name: "I understand this deletes my synthetic records." })
        .check();
    await page.getByRole("button", { name: "Reset synthetic records" }).click();
    await expect(page.getByText("Workspace reset. Audit history preserved.")).toBeVisible();
    await page.goto(run_url);
    await expect(page.getByRole("heading", { name: "Run not available" })).toBeVisible();
});

test("temporary outage recovers automatically on its third bounded attempt", async ({ page }) => {
    test.setTimeout(30_000);
    await open_scenario(page, "temporary_outage");
    await expect(page.getByRole("heading", { name: "Customer synchronized" })).toBeVisible({
        timeout: 22_000,
    });
    await expect(page.getByText("Attempt 3 · succeeded", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Restore simulator & retry" })).toHaveCount(0);
});

test("invalid destination stops without automatic retry and cross-workspace recovery is denied", async ({
    page,
    browser,
    baseURL,
}) => {
    await open_scenario(page, "invalid_destination");
    await expect(page.getByRole("heading", { name: "This run needs a closer look" })).toBeVisible({
        timeout: 8_000,
    });
    const run_id = page.url().split("/").at(-1);
    const detail = p1_run_detail_view.parse(
        await (await page.request.get(`/api/demo/runs/${run_id}`)).json(),
    );
    expect(detail.p1_attempt_count).toBe(1);
    expect(detail.p1_next_attempt_at).toBeNull();
    expect(detail.p1_error_code).toBe("SIMULATED_INVALID_DESTINATION");
    const other = await browser.newContext({ baseURL: baseURL ?? "http://127.0.0.1:3100" });
    try {
        expect(
            (
                await other.request.post("/api/demo/workspaces", {
                    headers: { origin: baseURL ?? "" },
                })
            ).status(),
        ).toBe(201);
        expect(
            (
                await other.request.post(`/api/demo/runs/${run_id}/retry`, {
                    headers: { origin: baseURL ?? "" },
                    data: { p1_confirm: true },
                })
            ).status(),
        ).toBe(404);
        expect(
            (
                await other.request.post("/api/demo/workspaces/reset", {
                    headers: { origin: baseURL ?? "" },
                    data: { p1_confirm: true, p1_request_id: randomUUID() },
                })
            ).status(),
        ).toBe(200);
        expect((await page.request.get(`/api/demo/runs/${run_id}`)).status()).toBe(200);
    } finally {
        await other.close();
    }
});

async function open_scenario(page: Page, scenario: string) {
    await page.goto("/");
    await page.getByRole("button", { name: "Enter live demo" }).click();
    await page.getByRole("link", { name: "Demo controls", exact: true }).click();
    await page.getByLabel("Destination scenario").selectOption(scenario);
    await page.getByRole("button", { name: "Send customer update" }).click();
    await page.getByRole("link", { name: "Inspect run" }).click();
}
