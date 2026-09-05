import type { NextRequest, NextResponse } from "next/server";
import { p1_overview_view } from "../../../../lib/contracts/demo_views.ts";
import { read_p1_overview } from "../../../../lib/synchronization/overview_repository.ts";
import {
    authorize_p1_demo_request,
    p1_demo_dependency_error,
    p1_demo_response,
} from "../../../../lib/workspaces/demo_http.ts";

export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        const workspace = await authorize_p1_demo_request(request);
        if (workspace === null) return p1_demo_response({ code: "WORKSPACE_UNAUTHORIZED" }, 401);
        if (request.nextUrl.searchParams.size > 0) {
            return p1_demo_response({ code: "INVALID_INPUT" }, 400);
        }
        const overview = await read_p1_overview(workspace.p1_workspace_id);
        return p1_demo_response(
            p1_overview_view.parse({
                ...overview,
                p1_expires_at: workspace.p1_expires_at.toISOString(),
            }),
            200,
        );
    } catch {
        return p1_demo_dependency_error();
    }
}
