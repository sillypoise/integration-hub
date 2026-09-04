import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    error: vi.fn<(context: unknown, message: string) => void>(),
    query: vi.fn<() => Promise<{ rowCount: number; rows: { p1_ready: number }[] }>>(),
}));

vi.mock("../../../lib/database/database_pool.ts", () => ({
    database_pool: { query: mocks.query },
}));

vi.mock("../../../lib/observability/application_logger.ts", () => ({
    application_logger: { error: mocks.error },
}));

import { GET } from "./route";

describe("GET /health/ready", () => {
    // These tests prove both dependency-ready and safe dependency-failure contracts.
    beforeEach(() => {
        mocks.error.mockReset();
        mocks.query.mockReset();
    });

    it("returns ready after the bounded database check succeeds", async () => {
        mocks.query.mockResolvedValue({ rowCount: 1, rows: [{ p1_ready: 1 }] });

        const response = await GET();

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        await expect(response.json()).resolves.toEqual({ status: "ready" });
    });

    it("returns a safe unavailable response when the database check fails", async () => {
        mocks.query.mockRejectedValue(new Error("secret provider detail"));

        const response = await GET();
        const body = await response.text();

        expect(response.status).toBe(503);
        expect(body).toBe('{"code":"DEPENDENCY_UNAVAILABLE"}');
        expect(body).not.toContain("secret provider detail");
        expect(mocks.error).toHaveBeenCalledOnce();
    });
});
