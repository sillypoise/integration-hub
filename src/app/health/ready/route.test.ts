import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    check_database_readiness: vi.fn<() => Promise<boolean>>(),
}));

vi.mock("../../../lib/database/database_readiness.ts", () => ({
    check_database_readiness: mocks.check_database_readiness,
}));

import { GET } from "./route";

describe("GET /health/ready", () => {
    // These tests prove both dependency-ready and safe dependency-failure contracts.
    beforeEach(() => {
        mocks.check_database_readiness.mockReset();
    });

    it("returns ready after the bounded database check succeeds", async () => {
        mocks.check_database_readiness.mockResolvedValue(true);

        const response = await GET();

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        await expect(response.json()).resolves.toEqual({ status: "ready" });
    });

    it("returns a safe unavailable response when the database check fails", async () => {
        mocks.check_database_readiness.mockResolvedValue(false);

        const response = await GET();
        const body = await response.text();

        expect(response.status).toBe(503);
        expect(body).toBe('{"code":"DEPENDENCY_UNAVAILABLE"}');
        expect(body).not.toContain("provider detail");
    });
});
