import { expect, test } from "@playwright/test";

// These checks run on desktop and mobile against the real application and isolated workspace.
test("a visitor completes the flow, inspects mapping, and proves safe replay", async ({
    page,
}, test_info) => {
    await page.goto("/");
    await page.screenshot({ path: test_info.outputPath("landing.png"), fullPage: true });
    await page.getByRole("button", { name: "Enter live demo" }).click();
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
    await expect(
        page.getByRole("heading", { name: "Your first update starts here" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Create a customer update" }).click();
    const input = page.getByRole("spinbutton", { name: "Customer number" });
    await input.fill("0");
    await page.getByRole("button", { name: "Send customer update" }).click();
    await expect(input).toBeFocused();
    expect(
        await input.evaluate((element: HTMLInputElement) => element.validity.rangeUnderflow),
    ).toBe(true);
    await input.fill("1");
    await page.screenshot({ path: test_info.outputPath("controls.png"), fullPage: true });
    await page.getByRole("button", { name: "Send customer update" }).click();
    await expect(page.getByRole("heading", { name: "Update accepted and queued." })).toBeVisible();
    await page.getByRole("link", { name: "Inspect run" }).click();
    await expect(page.getByRole("heading", { name: "Customer synchronized" })).toBeVisible({
        timeout: 10_000,
    });
    await expect(page.getByText("customer-1@example.test", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Execution timeline" })).toBeVisible();
    await expect(page.getByText("Auto-refresh stopped", { exact: true })).toBeVisible();
    await page.screenshot({ path: test_info.outputPath("run-detail.png"), fullPage: true });
    const run_url = page.url();
    await page.getByRole("link", { name: "Demo controls", exact: true }).click();
    await page.getByRole("button", { name: "Send customer update" }).click();
    await expect(
        page.getByRole("heading", { name: "Already accepted. No duplicate work." }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Inspect run" }).click();
    await expect(page).toHaveURL(run_url);
    await page.getByRole("link", { name: "Overview", exact: true }).click();
    await expect(
        page.locator(".metric").filter({ hasText: "Succeeded" }).locator("strong"),
    ).toHaveText("1");
    await page.screenshot({ path: test_info.outputPath("overview.png"), fullPage: true });
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.getByRole("link", { name: "View all runs" }).click();
    await page.getByLabel("Status on this page").selectOption("attention");
    await expect(
        page.getByRole("heading", { name: "No matching runs on this page" }),
    ).toBeVisible();
    await page.getByLabel("Status on this page").selectOption("succeeded");
    await expect(page.getByRole("link", { name: /Inspect run/ })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Previous page" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Next page" })).toBeDisabled();
    await page.screenshot({ path: test_info.outputPath("runs.png"), fullPage: true });
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
});

test("a fresh workspace changes only this browser's active session", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Enter live demo" }).click();
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
    const previous = (await (await page.request.get("/api/demo/workspaces")).json()) as unknown;
    await page.getByRole("link", { name: "Demo controls", exact: true }).click();
    await expect(
        page.getByText("It does not delete the old workspace", { exact: false }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Start a fresh workspace" }).click();
    await expect(
        page.getByRole("heading", { name: "Your first update starts here" }),
    ).toBeVisible();
    const current = (await (await page.request.get("/api/demo/workspaces")).json()) as unknown;
    expect(current).not.toEqual(previous);
});

test("keyboard entry has a visible focus indicator and unauthorized pages offer recovery", async ({
    page,
}) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main")).toBeFocused();
    await page.getByRole("button", { name: "Enter live demo" }).focus();
    expect(
        await page
            .getByRole("button", { name: "Enter live demo" })
            .evaluate((element) => getComputedStyle(element).outlineStyle),
    ).not.toBe("none");
    await page.goto("/demo/runs");
    await expect(
        page.getByRole("heading", { name: "Your workspace is unavailable" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Return to demo entry" })).toBeVisible();
});

test("loading, dependency failure, stale snapshot, and retry are explicit", async ({ page }) => {
    let mode = "loading";
    await page.route("**/api/demo/overview", async (route) => {
        if (mode === "loading") return;
        if (mode === "error") {
            await route.fulfill({ status: 503, json: { code: "DEPENDENCY_UNAVAILABLE" } });
            return;
        }
        await route.fulfill({
            json: {
                p1_total: 0,
                p1_succeeded: 0,
                p1_pending: 0,
                p1_attention: 0,
                p1_recent: [],
                p1_expires_at: "2026-09-10T00:00:00Z",
            },
        });
    });
    await page.goto("/demo");
    await expect(page.getByLabel("Loading workspace data")).toBeVisible();
    mode = "error";
    await expect(page.getByRole("heading", { name: "We couldn’t reach the service" })).toBeVisible({
        timeout: 7_000,
    });
    mode = "success";
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(
        page.getByRole("heading", { name: "Your first update starts here" }),
    ).toBeVisible();
    mode = "error";
    await page.getByRole("button", { name: "Refresh overview" }).click();
    await expect(page.getByText("Showing an older snapshot. Refresh failed.")).toBeVisible();
});
