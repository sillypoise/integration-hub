import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { list_p1_synchronization_runs } from "../../../../lib/synchronization/synchronization_queries.ts";
import {
    authorize_p1_demo_request,
    p1_demo_response,
    p1_demo_dependency_error,
} from "../../../../lib/workspaces/demo_http.ts";

export async function GET(request: NextRequest): Promise<NextResponse> {
    try {
        const workspace = await authorize_p1_demo_request(request);
        if (workspace === null) return p1_demo_response({ code: "WORKSPACE_UNAUTHORIZED" }, 401);
        const parameters = request.nextUrl.searchParams;
        if (parameters.size > 1) return p1_demo_response({ code: "INVALID_INPUT" }, 400);
        if (parameters.size === 1) {
            if (!parameters.has("p1_page")) {
                return p1_demo_response({ code: "INVALID_INPUT" }, 400);
            }
        }
        const raw_page = parameters.get("p1_page") ?? "1";
        if (!/^[1-9][0-9]?$/u.test(raw_page)) {
            return p1_demo_response({ code: "INVALID_INPUT" }, 400);
        }
        const page = z.number().int().min(1).max(50).safeParse(Number(raw_page));
        if (!page.success) return p1_demo_response({ code: "INVALID_INPUT" }, 400);
        const runs = await list_p1_synchronization_runs({
            p1_workspace_id: workspace.p1_workspace_id,
            p1_page: page.data,
        });
        return p1_demo_response({ p1_runs: runs, p1_page: page.data, p1_page_size: 20 }, 200);
    } catch {
        return p1_demo_dependency_error();
    }
}
