import { z } from "zod";

export const p1_run_state_schema = z.enum([
    "queued",
    "processing",
    "succeeded",
    "retryable_failure",
    "terminal_failure",
]);
export const p1_attempt_state_schema = z.enum([
    "processing",
    "succeeded",
    "retryable_failure",
    "terminal_failure",
    "interrupted",
]);
