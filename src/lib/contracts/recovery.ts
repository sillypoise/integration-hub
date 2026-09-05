import { z } from "zod";

export const p1_scenario_schema = z.enum([
    "success",
    "rate_limit",
    "temporary_outage",
    "persistent_outage",
    "invalid_destination",
]);
export type P1Scenario = z.infer<typeof p1_scenario_schema>;
export const p1_failure_code_schema = z.enum([
    "SIMULATED_RATE_LIMIT",
    "SIMULATED_OUTAGE",
    "SIMULATED_INVALID_DESTINATION",
    "RETRY_EXHAUSTED",
]);
export const p1_recovery_request_schema = z.object({ p1_confirm: z.literal(true) }).strict();
export const p1_reset_request_schema = p1_recovery_request_schema.extend({
    p1_request_id: z.uuid(),
});
export const p1_recovery_response_schema = z.object({ code: z.literal("RETRY_ACCEPTED") });
export const p1_reset_response_schema = z.object({ code: z.literal("WORKSPACE_RESET") });
