import { expect, test } from "@playwright/test";

test.describe("application foundation", () => {
    // This smoke test checks the public shell and liveness boundary through a real browser server.
    test("renders the product identity", async ({ page }) => {
        await page.goto("/");

        await expect(page.getByRole("heading", { name: "Integration Hub" })).toBeVisible();
        await expect(page).toHaveTitle(/Integration Hub/);
    });

    test("exposes a non-cacheable liveness response", async ({ request }) => {
        const response = await request.get("/health/live");

        expect(response.status()).toBe(200);
        expect(response.headers()["cache-control"]).toBe("no-store");
        await expect(response.json()).resolves.toEqual({ status: "ok" });
    });
});
