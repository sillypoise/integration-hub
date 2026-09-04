import assert from "node:assert/strict";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { read_server_environment } from "../../../../lib/config/server_environment.ts";
import { application_logger } from "../../../../lib/observability/application_logger.ts";
import {
    authorize_p1_demo_workspace,
    create_p1_demo_workspace,
} from "../../../../lib/workspaces/workspace_repository.ts";
import {
    p1_workspace_cookie_name,
    p1_workspace_token_max_age_seconds,
} from "../../../../lib/workspaces/workspace_token.ts";

const response_headers = { "cache-control": "no-store" };

export async function GET(request: NextRequest): Promise<NextResponse> {
    const workspace_token = request.cookies.get(p1_workspace_cookie_name)?.value;

    try {
        const workspace = await authorize_p1_demo_workspace(workspace_token, {
            current_time: new Date(),
        });

        if (workspace === null) {
            return NextResponse.json(
                { code: "WORKSPACE_UNAUTHORIZED" },
                { headers: response_headers, status: 401 },
            );
        }

        return NextResponse.json(
            {
                p1_expires_at: workspace.p1_expires_at.toISOString(),
                p1_workspace_id: workspace.p1_workspace_id,
            },
            { headers: response_headers, status: 200 },
        );
    } catch (error: unknown) {
        return workspace_route_internal_error(error);
    }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
    const environment = read_server_environment(process.env);
    const request_origin = request.headers.get("origin");

    assert.ok(environment.APPLICATION_ORIGIN.length > 0);
    assert.ok(request.url.length > 0);

    if (request_origin !== environment.APPLICATION_ORIGIN) {
        return NextResponse.json(
            { code: "ORIGIN_DENIED" },
            { headers: response_headers, status: 403 },
        );
    }

    const content_length = request.headers.get("content-length");
    const content_type = request.headers.get("content-type");
    const transfer_encoding = request.headers.get("transfer-encoding");

    if (content_length !== null) {
        if (content_length !== "0") {
            return workspace_route_invalid_input();
        }
    }
    if (content_type !== null) return workspace_route_invalid_input();
    if (transfer_encoding !== null) return workspace_route_invalid_input();

    try {
        const result = await create_p1_demo_workspace({ current_time: new Date() });

        if (!result.ok) {
            return NextResponse.json(
                { code: result.code },
                { headers: response_headers, status: 503 },
            );
        }

        const response = NextResponse.json(
            {
                p1_expires_at: result.p1_expires_at.toISOString(),
                p1_workspace_id: result.p1_workspace_id,
            },
            { headers: response_headers, status: 201 },
        );
        const secure_cookie = new URL(environment.APPLICATION_ORIGIN).protocol === "https:";

        // Omitting Domain intentionally creates a host-only cookie with the smallest scope.
        response.cookies.set({
            expires: result.p1_expires_at,
            httpOnly: true,
            maxAge: p1_workspace_token_max_age_seconds,
            name: p1_workspace_cookie_name,
            partitioned: false,
            path: "/",
            priority: "high",
            sameSite: "strict",
            secure: secure_cookie,
            value: result.p1_token,
        });

        return response;
    } catch (error: unknown) {
        return workspace_route_internal_error(error);
    }
}

function workspace_route_invalid_input(): NextResponse {
    assert.ok(response_headers["cache-control"].length > 0);
    assert.equal(response_headers["cache-control"], "no-store");

    return NextResponse.json({ code: "INVALID_INPUT" }, { headers: response_headers, status: 400 });
}

function workspace_route_internal_error(error: unknown): NextResponse {
    const error_type = error instanceof Error ? error.name : "UnknownError";

    assert.ok(error_type.length > 0);
    assert.ok(error_type.length <= 100);

    application_logger.error({ error_type }, "Workspace request failed.");
    return NextResponse.json(
        { code: "INTERNAL_ERROR" },
        { headers: response_headers, status: 500 },
    );
}
