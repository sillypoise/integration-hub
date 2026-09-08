import { expect, test } from "@playwright/test";

// Inspect actual production responses and browser enforcement, not just configured header strings.
test("fresh nonces hydrate the demo, deny injected scripts, and protect API responses", async ({
    page,
}) => {
    const violations: string[] = [];
    page.on("console", (message) => {
        if (message.text().toLowerCase().includes("content security policy")) {
            if (violations.length < 10) violations.push("CSP violation");
        }
    });
    const first = await page.goto("/");
    const first_policy = first?.headers()["content-security-policy"] ?? "";
    expect(first_policy).toContain("strict-dynamic");
    expect(first_policy).toContain("frame-ancestors 'none'");
    expect(first_policy).not.toContain("unsafe-eval");
    expect(first?.headers()["x-content-type-options"]).toBe("nosniff");
    expect(first?.headers()["referrer-policy"]).toBe("no-referrer");
    const next = await page.reload();
    expect(next?.headers()["content-security-policy"]).not.toBe(first_policy);
    await page.getByRole("button", { name: "Enter live demo" }).click();
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Demo controls", exact: true }).click();
    await expect(page.getByLabel("Destination scenario")).toBeVisible();
    expect(violations).toEqual([]);
    // Inject parser-created HTML, not DevTools-evaluated code that bypasses browser CSP checks.
    await page.route("**/csp-probe", async (route) => {
        const response = await route.fetch({ url: new URL("/", route.request().url()).href });
        const body = (await response.text()).replace(
            "</head>",
            "<script>document.documentElement.dataset.p1Injected = 'yes'</script></head>",
        );
        await route.fulfill({ response, body });
    });
    await page.goto("/csp-probe");
    expect(await page.locator("html").getAttribute("data-p1-injected")).toBeNull();
    await expect.poll(() => violations.length).toBe(1);
    const denied = await page.request.post("/api/demo/events", {
        headers: { origin: "https://foreign.test" },
        data: { p1_customer_number: 1, p1_revision: 1 },
    });
    expect(denied.status()).toBe(403);
    expect(denied.headers()["x-frame-options"]).toBe("DENY");
    expect(denied.headers()["cache-control"]).toBe("no-store");
    expect(await denied.json()).toEqual({ code: "ORIGIN_DENIED" });
});

test("oversized headers and URLs fail before routing, and quota failures remain readable", async ({
    page,
    request,
}) => {
    const oversized = await request.get("/api/demo/runs", {
        headers: { "x-oversized": "x".repeat(9_000) },
    });
    expect(oversized.status()).toBe(431);
    const long_url = await request.get(`/api/demo/runs?x=${"x".repeat(2_100)}`);
    expect(long_url.status()).toBe(414);
    expect(await long_url.json()).toEqual({ code: "INVALID_INPUT" });
    await page.route("**/api/demo/overview", (route) =>
        route.fulfill({
            status: 429,
            headers: { "retry-after": "86400" },
            json: { code: "DEMO_BUDGET_REACHED" },
        }),
    );
    await page.goto("/demo");
    await expect(page.getByRole("heading", { name: "Demo admission paused" })).toBeVisible();
    await expect(page.getByText(/A fresh workspace cannot bypass/u)).toBeVisible();
});
