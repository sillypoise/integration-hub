import { NextRequest } from "next/server";
import { beforeEach, expect, it, vi } from "vitest";

import * as workspaces from "../../../../lib/workspaces/workspace_repository.ts";
import * as repository from "../../../../lib/synchronization/synchronization_repository.ts";
import * as queries from "../../../../lib/synchronization/synchronization_queries.ts";
import { GET as list_runs } from "../runs/route.ts";
import { GET as read_detail } from "../runs/[run_id]/route.ts";
import { POST } from "./route.ts";

vi.mock("../../../../lib/workspaces/workspace_repository.ts", () => ({
    authorize_p1_demo_workspace: vi.fn<typeof workspaces.authorize_p1_demo_workspace>(),
}));
vi.mock("../../../../lib/synchronization/synchronization_repository.ts", () => ({
    accept_p1_source_event: vi.fn<typeof repository.accept_p1_source_event>(),
}));
vi.mock("../../../../lib/synchronization/synchronization_queries.ts", () => ({
    list_p1_synchronization_runs: vi.fn<typeof queries.list_p1_synchronization_runs>(),
    read_p1_synchronization_detail: vi.fn<typeof queries.read_p1_synchronization_detail>(),
}));
const workspace_id = "10000000-0000-4000-8000-000000000001";
const run_id = "10000000-0000-4000-8000-000000000002";
const event_id = "10000000-0000-4000-8000-000000000003";
const origin = "http://127.0.0.1:3000";

// Mock only persistence, retaining real origin, cookie boundary, JSON reader, and schema checks.
beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(workspaces.authorize_p1_demo_workspace).mockResolvedValue({
        p1_workspace_id: workspace_id,
        p1_expires_at: new Date(Date.now() + 60_000),
    });
    vi.mocked(repository.accept_p1_source_event).mockResolvedValue({
        ok: true,
        value: {
            duplicate: false,
            p1_run_id: run_id,
            p1_source_event_id: event_id,
        },
    });
    vi.mocked(queries.list_p1_synchronization_runs).mockResolvedValue([]);
    vi.mocked(queries.read_p1_synchronization_detail).mockResolvedValue({ p1_run_id: run_id });
});

it("accepts only generated customer data and returns stable identifiers", async () => {
    const response = await POST(event_request('{"p1_customer_number":1,"p1_revision":1}'));
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ p1_run_id: run_id, p1_correlation_id: run_id });
    expect(repository.accept_p1_source_event).toHaveBeenCalledWith(
        expect.objectContaining({
            p1_customer: expect.objectContaining({ p1_email: "customer-1@example.test" }),
        }),
        expect.objectContaining({ p1_workspace_id: workspace_id }),
    );
});

it("denies foreign and missing origins before authorization or persistence", async () => {
    const request = event_request("{}");
    request.headers.set("origin", "https://foreign.test");
    expect((await POST(request)).status).toBe(403);
    request.headers.delete("origin");
    expect((await POST(request)).status).toBe(403);
    expect(workspaces.authorize_p1_demo_workspace).not.toHaveBeenCalled();
    expect(repository.accept_p1_source_event).not.toHaveBeenCalled();
});

it.each([
    "{",
    "null",
    '{"p1_customer_number":0,"p1_revision":1001}',
    '{"p1_customer_number":1,"p1_revision":1,"secret":"must-not-echo"}',
])("rejects invalid body %# without persistence or echoing input", async (body) => {
    const response = await POST(event_request(body));
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("must-not-echo");
    expect(repository.accept_p1_source_event).not.toHaveBeenCalled();
});

it("returns bounded field names for invalid numeric inputs", async () => {
    const response = await POST(event_request('{"p1_customer_number":0,"p1_revision":1001}'));
    expect(await response.json()).toEqual({
        code: "INVALID_INPUT",
        p1_fields: ["p1_customer_number", "p1_revision"],
    });
});

it("converges duplicates without claiming a second accepted event", async () => {
    vi.mocked(repository.accept_p1_source_event).mockResolvedValue({
        ok: true,
        value: {
            duplicate: true,
            p1_run_id: run_id,
            p1_source_event_id: event_id,
        },
    });
    const response = await POST(event_request('{"p1_customer_number":1,"p1_revision":1}'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ code: "DUPLICATE_EVENT", duplicate: true });
});

it.each(["WORKSPACE_UNAUTHORIZED", "EVENT_LIMIT_REACHED"] as const)(
    "returns stable acceptance failure %s",
    async (code) => {
        vi.mocked(repository.accept_p1_source_event).mockResolvedValue({ ok: false, code });
        const response = await POST(event_request('{"p1_customer_number":1,"p1_revision":1}'));
        expect(response.status).toBe(code === "EVENT_LIMIT_REACHED" ? 409 : 401);
        expect(await response.json()).toEqual({ code });
    },
);

it("denies unauthenticated intake, listing, and detail without accessing protected records", async () => {
    vi.mocked(workspaces.authorize_p1_demo_workspace).mockResolvedValue(null);
    expect((await POST(event_request("{}"))).status).toBe(401);
    expect((await list_runs(new NextRequest(`${origin}/api/demo/runs`))).status).toBe(401);
    expect(
        (
            await read_detail(new NextRequest(`${origin}/api/demo/runs/${run_id}`), {
                params: Promise.resolve({ run_id }),
            })
        ).status,
    ).toBe(401);
    expect(repository.accept_p1_source_event).not.toHaveBeenCalled();
    expect(queries.list_p1_synchronization_runs).not.toHaveBeenCalled();
    expect(queries.read_p1_synchronization_detail).not.toHaveBeenCalled();
});

it.each([
    "?p1_page=0",
    "?p1_page=51",
    "?p1_page=1.1",
    "?p1_page=01",
    "?p1_page=1&p1_page=2",
    "?unknown=1",
])("rejects list boundary %s", async (query) => {
    expect((await list_runs(new NextRequest(`${origin}/api/demo/runs${query}`))).status).toBe(400);
    expect(queries.list_p1_synchronization_runs).not.toHaveBeenCalled();
});

it.each(["", "?p1_page=50"])("accepts list boundary %s", async (query) => {
    expect((await list_runs(new NextRequest(`${origin}/api/demo/runs${query}`))).status).toBe(200);
    expect(queries.list_p1_synchronization_runs).toHaveBeenCalledWith({
        p1_workspace_id: workspace_id,
        p1_page: query === "" ? 1 : 50,
    });
});

it("returns scoped detail, hides absent resources, and rejects malformed IDs or queries", async () => {
    const context = { params: Promise.resolve({ run_id }) };
    const request = new NextRequest(`${origin}/api/demo/runs/${run_id}`);
    expect((await read_detail(request, context)).status).toBe(200);
    vi.mocked(queries.read_p1_synchronization_detail).mockResolvedValue(null);
    expect((await read_detail(request, context)).status).toBe(404);
    expect(
        (await read_detail(request, { params: Promise.resolve({ run_id: "bad" }) })).status,
    ).toBe(400);
    expect((await read_detail(new NextRequest(`${request.url}?unknown=1`), context)).status).toBe(
        400,
    );
});

it("redacts dependency errors across all endpoints", async () => {
    vi.mocked(workspaces.authorize_p1_demo_workspace).mockRejectedValue(
        new Error("postgresql://must-not-echo"),
    );
    const responses = await Promise.all([
        POST(event_request("{}")),
        list_runs(new NextRequest(`${origin}/api/demo/runs`)),
        read_detail(new NextRequest(`${origin}/api/demo/runs/${run_id}`), {
            params: Promise.resolve({ run_id }),
        }),
    ]);
    expect(responses.map((response) => response.status)).toEqual([503, 503, 503]);
    expect(await Promise.all(responses.map((response) => response.json()))).toEqual(
        Array.from({ length: 3 }, () => ({ code: "DEPENDENCY_UNAVAILABLE" })),
    );
});

function event_request(body: string) {
    return new NextRequest(`${origin}/api/demo/events`, {
        method: "POST",
        body,
        headers: { origin, "content-type": "application/json" },
    });
}
