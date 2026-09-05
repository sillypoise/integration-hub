import { z } from "zod";
import { p1_scenario_schema, p1_failure_code_schema } from "./recovery.ts";
import { p1_attempt_state_schema, p1_run_state_schema } from "./run_states.ts";

const timestamp = z.iso.datetime({ offset: true });
const delivery_state = z.enum(["created", "retry", "active", "completed", "cancelled", "failed"]);
export const p1_run_summary_view = z.object({
    p1_run_id: z.uuid(),
    p1_source_event_id: z.uuid(),
    p1_state: p1_run_state_schema,
    p1_delivery_state: delivery_state.nullable(),
    p1_attempt_count: z.number().int().min(0).max(4),
    p1_created_at: timestamp,
    p1_completed_at: timestamp.nullable(),
});
export const p1_runs_view = z.object({
    p1_runs: z.array(p1_run_summary_view).max(20),
    p1_page: z.number().int().min(1).max(50),
    p1_page_size: z.literal(20),
});
export const p1_overview_view = z.object({
    p1_total: z.number().int().min(0).max(1_000),
    p1_succeeded: z.number().int().min(0).max(1_000),
    p1_pending: z.number().int().min(0).max(1_000),
    p1_attention: z.number().int().min(0).max(1_000),
    p1_recent: z.array(p1_run_summary_view).max(6),
    p1_expires_at: timestamp,
});
export const p1_run_detail_view = p1_run_summary_view.extend({
    p1_correlation_id: z.uuid(),
    p1_scenario: p1_scenario_schema.default("success"),
    p1_manual_retry_count: z.number().int().min(0).max(1).default(0),
    p1_error_code: p1_failure_code_schema.nullable().default(null),
    p1_next_attempt_at: timestamp.nullable(),
    p1_destination_mode: z.literal("simulated"),
    p1_source: z.object({
        p1_event_type: z.literal("commerce.customer.updated"),
        p1_external_id: z.string().min(1).max(64),
        p1_updated_at: timestamp,
    }),
    p1_destination: z
        .object({
            p1_external_id: z.string().min(1).max(64),
            p1_email: z.email().max(254),
            p1_first_name: z.string().min(1).max(80),
            p1_last_name: z.string().min(1).max(80),
            p1_source_updated_at: timestamp,
        })
        .nullable(),
    p1_attempts: z
        .array(
            z.object({
                p1_attempt_number: z.number().int().min(1).max(4),
                p1_state: p1_attempt_state_schema,
                p1_error_code: z.string().max(64).nullable(),
                p1_started_at: timestamp,
                p1_completed_at: timestamp.nullable(),
            }),
        )
        .max(4),
});
export const p1_workspace_view = z.object({ p1_workspace_id: z.uuid(), p1_expires_at: timestamp });
export const p1_acceptance_view = z.object({
    code: z.enum(["EVENT_ACCEPTED", "DUPLICATE_EVENT"]),
    duplicate: z.boolean(),
    p1_run_id: z.uuid(),
    p1_source_event_id: z.uuid(),
    p1_correlation_id: z.uuid(),
});
export type P1RunView = z.infer<typeof p1_run_summary_view>;
export type P1DetailView = z.infer<typeof p1_run_detail_view>;

export function p1_run_category(run: Pick<P1RunView, "p1_state" | "p1_delivery_state">) {
    if (run.p1_state === "succeeded") return "succeeded";
    if (run.p1_state === "terminal_failure") return "attention";
    if (run.p1_delivery_state === "failed") return "attention";
    if (run.p1_delivery_state === "cancelled") return "attention";
    return "pending";
}

export function p1_detail_is_active(run: P1DetailView): boolean {
    if (p1_run_category(run) !== "pending") return false;
    if (run.p1_delivery_state === null) return false;
    if (run.p1_delivery_state === "completed") return false;
    return true;
}
