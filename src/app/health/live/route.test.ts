import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("GET /health/live", () => {
    // This test proves liveness is stable, cache-disabled, and independent of the database.
    it("returns the bounded liveness contract", async () => {
        const response = GET();

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        await expect(response.json()).resolves.toEqual({ status: "ok" });
    });
});
