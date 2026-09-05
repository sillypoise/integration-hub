import { NextRequest } from "next/server";
import { afterEach, expect, it, vi } from "vitest";
import * as workspaces from "../../../../lib/workspaces/workspace_repository.ts";
import * as overview from "../../../../lib/synchronization/overview_repository.ts";
import { GET } from "./route.ts";

afterEach(() => {
    vi.restoreAllMocks();
});

// The new boundary must retain authentication, query rejection, safe failures, and no caching.
it("authorizes and validates overview requests before reading aggregate data", async () => {
    const authorize = vi.spyOn(workspaces, "authorize_p1_demo_workspace").mockResolvedValue(null);
    const read = vi.spyOn(overview, "read_p1_overview").mockResolvedValue({
        p1_total: 0,
        p1_succeeded: 0,
        p1_pending: 0,
        p1_attention: 0,
        p1_recent: [],
    });
    const request = new NextRequest("http://127.0.0.1:3000/api/demo/overview");
    expect((await GET(request)).status).toBe(401);
    expect(read).not.toHaveBeenCalled();
    authorize.mockResolvedValue({
        p1_workspace_id: "10000000-0000-4000-8000-000000000001",
        p1_expires_at: new Date("2026-09-10T00:00:00Z"),
    });
    expect((await GET(new NextRequest(`${request.url}?p1_workspace_id=other`))).status).toBe(400);
    expect(read).not.toHaveBeenCalled();
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ p1_total: 0, p1_recent: [] });
    read.mockRejectedValue(new Error("postgresql://do-not-return"));
    const unavailable = await GET(request);
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toEqual({ code: "DEPENDENCY_UNAVAILABLE" });
});
