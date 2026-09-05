import type { NextRequest, NextResponse } from "next/server";

import { read_server_environment } from "../../../../lib/config/server_environment.ts";
import { read_p1_json_body } from "../../../../lib/contracts/bounded_json_body.ts";
import { application_logger } from "../../../../lib/observability/application_logger.ts";
import {
    create_p1_simulated_customer_event,
    p1_commerce_simulator_input_schema,
} from "../../../../lib/simulators/commerce_simulator.ts";
import { accept_p1_source_event } from "../../../../lib/synchronization/synchronization_repository.ts";
import {
    authorize_p1_demo_request,
    p1_demo_response,
    p1_demo_dependency_error,
} from "../../../../lib/workspaces/demo_http.ts";

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        const environment = read_server_environment(process.env);
        if (request.headers.get("origin") !== environment.APPLICATION_ORIGIN) {
            application_logger.warn({}, "Demo event origin denied.");
            return p1_demo_response({ code: "ORIGIN_DENIED" }, 403);
        }
        const workspace = await authorize_p1_demo_request(request);
        if (workspace === null) return p1_demo_response({ code: "WORKSPACE_UNAUTHORIZED" }, 401);
        const input = p1_commerce_simulator_input_schema.safeParse(
            await read_p1_json_body(request),
        );
        if (!input.success) {
            // A fixed field allowlist avoids echoing attacker-controlled unknown property names.
            const fields = ["p1_customer_number", "p1_revision"].filter((field) =>
                input.error.issues.some((issue) => issue.path[0] === field),
            );
            return p1_demo_response({ code: "INVALID_INPUT", p1_fields: fields }, 400);
        }
        const accepted = await accept_p1_source_event(
            create_p1_simulated_customer_event(input.data),
            {
                current_time: new Date(),
                p1_workspace_id: workspace.p1_workspace_id,
            },
        );
        if (!accepted.ok) {
            return p1_demo_response(
                { code: accepted.code },
                accepted.code === "WORKSPACE_UNAUTHORIZED" ? 401 : 409,
            );
        }
        const p1_correlation_id = accepted.value.p1_run_id;
        application_logger.info(
            { p1_correlation_id, duplicate: accepted.value.duplicate },
            "Simulated event accepted.",
        );
        return p1_demo_response(
            {
                ...accepted.value,
                p1_correlation_id,
                code: accepted.value.duplicate ? "DUPLICATE_EVENT" : "EVENT_ACCEPTED",
            },
            accepted.value.duplicate ? 200 : 202,
        );
    } catch {
        return p1_demo_dependency_error();
    }
}
