import assert from "node:assert/strict";
import { z } from "zod";

export const p1_source_payload_max_bytes = 16_384;
export const p1_workspace_event_limit = 1_000;
export const p1_run_attempt_limit = 3;

const p1_external_identifier_schema = z.string().trim().min(1).max(64);
const p1_person_name_schema = z.string().trim().min(1).max(80);

export const p1_source_customer_event_schema = z
    .object({
        p1_customer: z
            .object({
                p1_email: z.email().max(254),
                p1_external_id: p1_external_identifier_schema,
                p1_first_name: p1_person_name_schema,
                p1_last_name: p1_person_name_schema,
                p1_updated_at: z.iso.datetime({ offset: true }),
            })
            .strict(),
        p1_event_type: z.literal("commerce.customer.updated"),
        p1_idempotency_key: z
            .string()
            .min(1)
            .max(64)
            .regex(/^[A-Za-z0-9._:-]+$/u),
    })
    .strict();

export const p1_mapped_customer_schema = z
    .object({
        p1_email: z.email().max(254),
        p1_external_id: p1_external_identifier_schema,
        p1_first_name: p1_person_name_schema,
        p1_last_name: p1_person_name_schema,
        p1_source_updated_at: z.iso.datetime({ offset: true }),
    })
    .strict();

export const p1_synchronization_job_schema = z
    .object({
        p1_correlation_id: z.uuid(),
        p1_run_id: z.uuid(),
        p1_source_event_id: z.uuid(),
        p1_workspace_id: z.uuid(),
    })
    .strict();

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

export const p1_safe_error_code_schema = z.enum([
    "DEPENDENCY_UNAVAILABLE",
    "DUPLICATE_EVENT",
    "EVENT_LIMIT_REACHED",
    "INTERNAL_ERROR",
    "INVALID_INPUT",
    "ORIGIN_DENIED",
    "RESOURCE_NOT_FOUND",
    "WORKSPACE_CAPACITY_EXCEEDED",
    "WORKSPACE_UNAUTHORIZED",
]);

export type P1SourceCustomerEvent = Readonly<z.infer<typeof p1_source_customer_event_schema>>;
export type P1MappedCustomer = Readonly<z.infer<typeof p1_mapped_customer_schema>>;
export type P1SynchronizationJob = Readonly<z.infer<typeof p1_synchronization_job_schema>>;
export type P1RunState = z.infer<typeof p1_run_state_schema>;

export function parse_p1_source_customer_event(input: unknown): P1SourceCustomerEvent {
    assert.ok(p1_source_payload_max_bytes > 0);
    assert.ok(p1_workspace_event_limit > 0);

    const source_event = p1_source_customer_event_schema.parse(input);
    const payload_bytes = Buffer.byteLength(JSON.stringify(source_event), "utf8");

    assert.ok(payload_bytes <= p1_source_payload_max_bytes);
    assert.ok(payload_bytes > 0);

    return Object.freeze(source_event);
}
