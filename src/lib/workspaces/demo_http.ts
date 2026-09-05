import assert from "node:assert/strict";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { application_logger } from "../observability/application_logger.ts";
import { authorize_p1_demo_workspace } from "./workspace_repository.ts";
import { p1_workspace_cookie_name } from "./workspace_token.ts";

export function p1_demo_response(body: unknown, status: number): NextResponse {
    assert.ok(status >= 200);
    assert.ok(status <= 599);
    return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function authorize_p1_demo_request(request: NextRequest) {
    assert.ok(request.url.length > 0);
    assert.ok(p1_workspace_cookie_name.length > 0);
    const workspace = await authorize_p1_demo_workspace(
        request.cookies.get(p1_workspace_cookie_name)?.value,
        { current_time: new Date() },
    );
    if (workspace === null) {
        application_logger.warn({}, "Demo workspace authorization denied.");
    }
    return workspace;
}

export function p1_demo_dependency_error(): NextResponse {
    application_logger.error({}, "Demo request dependency failed.");
    return p1_demo_response({ code: "DEPENDENCY_UNAVAILABLE" }, 503);
}
