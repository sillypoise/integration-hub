import { expect, test } from "@playwright/test";

test.describe("application foundation", () => {
    // This smoke test checks the public shell and liveness boundary through a real browser server.
    test("renders the product identity", async ({ page }) => {
        await page.goto("/");

        await expect(
            page.getByRole("heading", { name: "Every customer update. Accounted for." }),
        ).toBeVisible();
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

test.describe("workspace boundary", () => {
    // This browser-server check proves origin denial and opaque cookie-based authorization.
    test("issues and authenticates an isolated demo workspace", async ({ request }) => {
        const denied_response = await request.post("/api/demo/workspaces");
        const creation_response = await request.post("/api/demo/workspaces", {
            headers: { origin: "http://127.0.0.1:3100" },
        });
        const current_response = await request.get("/api/demo/workspaces");
        const creation_body = await creation_response.text();

        expect(denied_response.status()).toBe(403);
        expect(creation_response.status()).toBe(201);
        expect(creation_response.headers()["set-cookie"]).toContain("HttpOnly");
        expect(creation_body).not.toContain("p1w_");
        expect(current_response.status()).toBe(200);
    });
});
