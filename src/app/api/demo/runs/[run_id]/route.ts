import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { read_p1_synchronization_detail } from "../../../../../lib/synchronization/synchronization_queries.ts";
import {
    authorize_p1_demo_request,
    p1_demo_response,
    p1_demo_dependency_error,
} from "../../../../../lib/workspaces/demo_http.ts";

export async function GET(
    request: NextRequest,
    context: RouteContext<"/api/demo/runs/[run_id]">,
): Promise<NextResponse> {
    try {
        const workspace = await authorize_p1_demo_request(request);
        if (workspace === null) return p1_demo_response({ code: "WORKSPACE_UNAUTHORIZED" }, 401);
        const { run_id } = await context.params;
        const parsed_id = z.uuid().safeParse(run_id);
        if (!parsed_id.success) return p1_demo_response({ code: "INVALID_INPUT" }, 400);
        if (request.nextUrl.searchParams.size > 0) {
            return p1_demo_response({ code: "INVALID_INPUT" }, 400);
        }
        const detail = await read_p1_synchronization_detail({
            p1_workspace_id: workspace.p1_workspace_id,
            p1_run_id: parsed_id.data,
        });
        if (detail === null) return p1_demo_response({ code: "RESOURCE_NOT_FOUND" }, 404);
        return p1_demo_response({ ...detail, p1_destination_mode: "simulated" }, 200);
    } catch {
        return p1_demo_dependency_error();
    }
}
