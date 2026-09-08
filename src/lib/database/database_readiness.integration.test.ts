import { createServer } from "node:net";
import { afterEach, expect, it, vi } from "vitest";
import { check_database_readiness } from "./database_readiness.ts";
import { GET as ready } from "../../app/health/ready/route.ts";
import { GET as live } from "../../app/health/live/route.ts";

// A real refused TCP connection proves bounded failure and recovery without touching other sessions.
afterEach(() => {
    vi.unstubAllEnvs();
});
it("returns non-cacheable unready while PostgreSQL is unreachable, then recovers", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("Expected TCP address.");
    await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
    );
    const original = process.env.DATABASE_URL;
    vi.stubEnv("DATABASE_URL", `postgresql://test:test@127.0.0.1:${address.port}/unavailable`);
    const before = performance.now();
    const response = await ready();
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ code: "DEPENDENCY_UNAVAILABLE" });
    expect(performance.now() - before).toBeLessThan(3_000);
    expect(live().status).toBe(200);
    vi.stubEnv("DATABASE_URL", original);
    expect(await check_database_readiness()).toBe(true);
});
