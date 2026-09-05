import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";
import * as workspaces from "./workspace_repository.ts";
import * as repository from "../synchronization/recovery_repository.ts";
import { POST as retry } from "../../app/api/demo/runs/[run_id]/retry/route.ts";
import { POST as reset } from "../../app/api/demo/workspaces/reset/route.ts";

vi.mock("./workspace_repository.ts", () => ({
    authorize_p1_demo_workspace: vi.fn<typeof workspaces.authorize_p1_demo_workspace>(),
}));
vi.mock("../synchronization/recovery_repository.ts", () => ({
    mutate_p1_recovery: vi.fn<typeof repository.mutate_p1_recovery>(),
}));
const origin = "http://127.0.0.1:3000";
const workspace_id = randomUUID();
const run_id = randomUUID();
const context = { params: Promise.resolve({ run_id }) };
const confirmation = { p1_confirm: true };
const reset_body = { ...confirmation, p1_request_id: randomUUID() };

// Retain real route/schema/body boundaries; persistence is mocked to force safe error responses.
beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(workspaces.authorize_p1_demo_workspace).mockResolvedValue({
        p1_workspace_id: workspace_id,
        p1_expires_at: new Date(Date.now() + 60_000),
    });
    vi.mocked(repository.mutate_p1_recovery).mockResolvedValue("RETRY_ACCEPTED");
});
it("accepts scoped retry and reset with safe non-cacheable acknowledgements", async () => {
    const response = await retry(request(confirmation), context);
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(repository.mutate_p1_recovery).toHaveBeenCalledWith(workspace_id, {
        action: "retry",
        p1_run_id: run_id,
    });
    vi.mocked(repository.mutate_p1_recovery).mockResolvedValue("WORKSPACE_RESET");
    expect((await reset(request(reset_body))).status).toBe(200);
    expect(repository.mutate_p1_recovery).toHaveBeenLastCalledWith(workspace_id, {
        action: "reset",
        p1_request_id: reset_body.p1_request_id,
    });
});
it("fails closed for foreign/missing origin and unauthenticated recovery", async () => {
    const foreign = request(confirmation);
    foreign.headers.set("origin", "https://foreign.test");
    expect((await retry(foreign, context)).status).toBe(403);
    foreign.headers.delete("origin");
    expect((await reset(foreign)).status).toBe(403);
    expect(workspaces.authorize_p1_demo_workspace).not.toHaveBeenCalled();
    vi.mocked(workspaces.authorize_p1_demo_workspace).mockResolvedValue(null);
    expect((await retry(request(confirmation), context)).status).toBe(401);
    expect((await reset(request(reset_body))).status).toBe(401);
    expect(repository.mutate_p1_recovery).not.toHaveBeenCalled();
});
it.each([
    {},
    { p1_confirm: false },
    { p1_confirm: "true" },
    { ...confirmation, p1_workspace_id: "secret" },
])("rejects invalid confirmation %# without mutation", async (body) => {
    expect((await retry(request(body), context)).status).toBe(400);
    expect(repository.mutate_p1_recovery).not.toHaveBeenCalled();
});
it("rejects malformed identifiers, unknown query parameters, and reset requests without idempotency", async () => {
    expect(
        (await retry(request(confirmation), { params: Promise.resolve({ run_id: "bad" }) })).status,
    ).toBe(400);
    expect((await reset(request(confirmation))).status).toBe(400);
    expect((await reset(request(reset_body, "?workspace=foreign"))).status).toBe(400);
    expect(repository.mutate_p1_recovery).not.toHaveBeenCalled();
});
it.each([
    ["WORKSPACE_UNAUTHORIZED", 401],
    ["RESOURCE_NOT_FOUND", 404],
    ["RETRY_NOT_ALLOWED", 409],
    ["RESET_LIMIT_REACHED", 409],
] as const)("returns stable %s", async (code, status) => {
    vi.mocked(repository.mutate_p1_recovery).mockResolvedValue(code);
    const response = await retry(request(confirmation), context);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ code });
});
it("redacts dependency failures and invalid JSON", async () => {
    vi.mocked(repository.mutate_p1_recovery).mockRejectedValue(new Error("postgresql://secret"));
    const response = await reset(request(reset_body));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ code: "DEPENDENCY_UNAVAILABLE" });
    expect(
        (
            await reset(
                new NextRequest(`${origin}/api/demo/workspaces/reset`, {
                    method: "POST",
                    headers: { origin, "content-type": "application/json" },
                    body: "{",
                }),
            )
        ).status,
    ).toBe(400);
});
function request(body: unknown, query = "") {
    return new NextRequest(`${origin}/api/demo/workspaces/reset${query}`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}
