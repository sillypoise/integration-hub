import { expect, test } from "@playwright/test";

// Check real empty screens at narrow, tablet, and wide boundaries, including keyboard focus.
// Existing operational/recovery tests cover populated, invalid, stale, and failure states.
test("polished screens retain navigation and fit viewport boundaries", async ({ page }, info) => {
    test.setTimeout(45_000);
    await page.goto("/");
    await page.getByRole("button", { name: "Enter live demo" }).click();
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
    // One page owns viewport and navigation state; parallel awaits would race those mutations.
    /* oxlint-disable no-await-in-loop */
    for (const width of [320, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        for (const path of ["/", "/demo", "/demo/controls", "/demo/runs"]) {
            await page.goto(path);
            await expect(page.locator("h1")).toBeVisible();
            if (path !== "/") {
                await expect(page.getByLabel("Loading workspace data")).toHaveCount(0);
                const active_link = page.locator('nav a[aria-current="page"]');
                await expect(active_link).toHaveCount(1);
                await active_link.focus();
                await expect(active_link).toBeFocused();
                expect(
                    await active_link.evaluate((link) => getComputedStyle(link).outlineStyle),
                ).not.toBe("none");
            }
            expect(
                await page.evaluate(
                    () => document.documentElement.scrollWidth <= window.innerWidth,
                ),
            ).toBe(true);
            await page.screenshot({
                path: info.outputPath(`${width}-${path.replaceAll("/", "_") || "landing"}.png`),
                fullPage: true,
            });
        }
    }
    /* oxlint-enable no-await-in-loop */
    const next_page = page.getByRole("button", { name: "Next page" });
    await expect(next_page).toBeDisabled();
    const background = await next_page.evaluate(
        (button) => getComputedStyle(button).backgroundColor,
    );
    // Disable transitions so an intermediate animation frame cannot hide a hover change.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await next_page.hover();
    await expect(next_page).toHaveCSS("background-color", background);
    expect(await next_page.evaluate((button) => getComputedStyle(button).transitionDuration)).toBe(
        "0s",
    );
});

// Short desktop windows must scroll the sidebar rather than strand its footer links offscreen.
test("short windows retain keyboard access to the sidebar footer", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 400 });
    await page.goto("/demo");
    const about = page.getByRole("link", { name: "About this project" });
    await about.focus();
    await expect(about).toBeFocused();
    expect(
        await about.evaluate((link) => {
            const bounds = link.getBoundingClientRect();
            return bounds.top >= 0 && bounds.bottom <= window.innerHeight;
        }),
    ).toBe(true);
});
