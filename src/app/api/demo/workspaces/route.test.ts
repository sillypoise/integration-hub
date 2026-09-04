import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type AuthorizeWorkspace = (
    token: unknown,
    options: Readonly<{ current_time: Date }>,
) => Promise<Readonly<{ p1_expires_at: Date; p1_workspace_id: string }> | null>;
type CreateWorkspace = (options: Readonly<{ current_time: Date }>) => Promise<
    | Readonly<{
          ok: true;
          p1_expires_at: Date;
          p1_token: string;
          p1_workspace_id: string;
      }>
    | Readonly<{ ok: false; code: "WORKSPACE_CAPACITY_EXCEEDED" }>
>;

const mocks = vi.hoisted(() => ({
    authorize_p1_demo_workspace: vi.fn<AuthorizeWorkspace>(),
    create_p1_demo_workspace: vi.fn<CreateWorkspace>(),
}));

vi.mock("../../../../lib/workspaces/workspace_repository.ts", () => ({
    authorize_p1_demo_workspace: mocks.authorize_p1_demo_workspace,
    create_p1_demo_workspace: mocks.create_p1_demo_workspace,
}));

import { GET, POST } from "./route";

const application_origin = "https://integration.example.test";
const expires_at = new Date("2026-09-05T22:00:00.000Z");

function set_valid_environment(): void {
    vi.stubEnv("APPLICATION_ORIGIN", application_origin);
    vi.stubEnv("DATABASE_SSL", "disable");
    vi.stubEnv("DATABASE_URL", "postgresql://user:password@localhost:5432/integration_hub");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("PORT", "3000");
    vi.stubEnv("SERVER_HOST", "127.0.0.1");
    mocks.authorize_p1_demo_workspace.mockReset();
    mocks.create_p1_demo_workspace.mockReset();
}

describe("POST /api/demo/workspaces", () => {
    // These boundary tests cover cookie security, invalid input, and origin denial.
    beforeEach(set_valid_environment);

    it("issues an opaque secure host-only workspace cookie", async () => {
        mocks.create_p1_demo_workspace.mockResolvedValue({
            ok: true,
            p1_expires_at: expires_at,
            p1_token: `p1w_${"a".repeat(43)}`,
            p1_workspace_id: "f4a5d7d9-d29e-4b89-8162-c756d263b92f",
        });
        const request = new NextRequest(`${application_origin}/api/demo/workspaces`, {
            headers: { origin: application_origin },
            method: "POST",
        });

        const response = await POST(request);
        const body = await response.text();
        const set_cookie = response.headers.get("set-cookie") ?? "";

        expect(response.status).toBe(201);
        expect(body).not.toContain("p1w_");
        expect(set_cookie).toContain("HttpOnly");
        expect(set_cookie).toContain("SameSite=strict");
        expect(set_cookie).toContain("Secure");
        expect(set_cookie).not.toContain("Domain=");
    });

    it("denies a cross-origin request before persistence", async () => {
        const request = new NextRequest(`${application_origin}/api/demo/workspaces`, {
            headers: { origin: "https://attacker.example" },
            method: "POST",
        });

        const response = await POST(request);

        expect(response.status).toBe(403);
        await expect(response.json()).resolves.toEqual({ code: "ORIGIN_DENIED" });
        expect(mocks.create_p1_demo_workspace).not.toHaveBeenCalled();
    });

    it.each([
        { body: "{}", headers: { origin: application_origin } },
        {
            body: null,
            headers: { origin: application_origin, "transfer-encoding": "chunked" },
        },
    ])(
        "rejects a request body or ambiguous transfer encoding before persistence",
        async (input) => {
            const request = new NextRequest(`${application_origin}/api/demo/workspaces`, {
                body: input.body,
                headers: input.headers,
                method: "POST",
            });

            const response = await POST(request);

            expect(response.status).toBe(400);
            expect(mocks.create_p1_demo_workspace).not.toHaveBeenCalled();
        },
    );
});

describe("GET /api/demo/workspaces", () => {
    // These checks keep missing credentials and successful metadata responses narrow.
    beforeEach(set_valid_environment);

    it("returns one stable denial for a missing or invalid workspace cookie", async () => {
        mocks.authorize_p1_demo_workspace.mockResolvedValue(null);
        const request = new NextRequest(`${application_origin}/api/demo/workspaces`);

        const response = await GET(request);

        expect(response.status).toBe(401);
        await expect(response.json()).resolves.toEqual({ code: "WORKSPACE_UNAUTHORIZED" });
    });

    it("returns only safe metadata for an authorized workspace", async () => {
        mocks.authorize_p1_demo_workspace.mockResolvedValue({
            p1_expires_at: expires_at,
            p1_workspace_id: "f4a5d7d9-d29e-4b89-8162-c756d263b92f",
        });
        const request = new NextRequest(`${application_origin}/api/demo/workspaces`, {
            headers: { cookie: `p1_demo_workspace=p1w_${"a".repeat(43)}` },
        });

        const response = await GET(request);
        const body = await response.text();

        expect(response.status).toBe(200);
        expect(body).toContain("f4a5d7d9-d29e-4b89-8162-c756d263b92f");
        expect(body).not.toContain("p1w_");
        expect(body).not.toContain("token");
    });
});
