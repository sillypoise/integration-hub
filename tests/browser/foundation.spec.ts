import { expect, test } from "@playwright/test";

test.describe("application foundation", () => {
    // This smoke test checks the public shell and liveness boundary through a real browser server.
    test("renders the product identity", async ({ page }) => {
        await page.goto("/");

        await expect(page.getByRole("heading", { name: "Integration Hub" })).toBeVisible();
        await expect(page).toHaveTitle(/Integration Hub/);
    });

    test("exposes non-cacheable health responses", async ({ request }) => {
        const liveness_response = await request.get("/health/live");
        const readiness_response = await request.get("/health/ready");

        expect(liveness_response.status()).toBe(200);
        expect(liveness_response.headers()["cache-control"]).toBe("no-store");
        await expect(liveness_response.json()).resolves.toEqual({ status: "ok" });
        expect(readiness_response.status()).toBe(200);
        expect(readiness_response.headers()["cache-control"]).toBe("no-store");
        await expect(readiness_response.json()).resolves.toEqual({ status: "ready" });
    });
});
