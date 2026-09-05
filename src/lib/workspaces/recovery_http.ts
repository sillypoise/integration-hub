import type { NextRequest } from "next/server";
import { z } from "zod";
import { read_server_environment } from "../config/server_environment.ts";
import { read_p1_json_body } from "../contracts/bounded_json_body.ts";
import { p1_recovery_request_schema, p1_reset_request_schema } from "../contracts/recovery.ts";
import { application_logger } from "../observability/application_logger.ts";
import {
    mutate_p1_recovery,
    type P1RecoveryAction,
} from "../synchronization/recovery_repository.ts";
import {
    authorize_p1_demo_request,
    p1_demo_dependency_error,
    p1_demo_response,
} from "./demo_http.ts";

export async function handle_p1_recovery_request(request: NextRequest, run_id: string | null) {
    try {
        const environment = read_server_environment(process.env);
        if (request.headers.get("origin") !== environment.APPLICATION_ORIGIN) {
            application_logger.warn({}, "Demo recovery origin denied.");
            return p1_demo_response({ code: "ORIGIN_DENIED" }, 403);
        }
        const workspace = await authorize_p1_demo_request(request);
        if (workspace === null) return p1_demo_response({ code: "WORKSPACE_UNAUTHORIZED" }, 401);
        if (request.nextUrl.searchParams.size > 0)
            return p1_demo_response({ code: "INVALID_INPUT" }, 400);
        const body = await read_p1_json_body(request);
        let action: P1RecoveryAction;
        if (run_id === null) {
            const input = p1_reset_request_schema.safeParse(body);
            if (!input.success) return p1_demo_response({ code: "INVALID_INPUT" }, 400);
            action = { action: "reset", p1_request_id: input.data.p1_request_id };
        } else {
            if (!z.uuid().safeParse(run_id).success)
                return p1_demo_response({ code: "INVALID_INPUT" }, 400);
            if (!p1_recovery_request_schema.safeParse(body).success)
                return p1_demo_response({ code: "INVALID_INPUT" }, 400);
            action = { action: "retry", p1_run_id: run_id };
        }
        const code = await mutate_p1_recovery(workspace.p1_workspace_id, action);
        application_logger.info(
            { code, action: action.action, p1_workspace_id: workspace.p1_workspace_id },
            "Demo recovery decision.",
        );
        if (code === "RETRY_ACCEPTED") return p1_demo_response({ code }, 202);
        if (code === "WORKSPACE_RESET") return p1_demo_response({ code }, 200);
        if (code === "WORKSPACE_UNAUTHORIZED") return p1_demo_response({ code }, 401);
        if (code === "RESOURCE_NOT_FOUND") return p1_demo_response({ code }, 404);
        return p1_demo_response({ code }, 409);
    } catch {
        return p1_demo_dependency_error();
    }
}
