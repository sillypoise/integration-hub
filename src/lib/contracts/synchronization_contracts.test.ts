import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
    p1_mapped_customer_schema,
    p1_source_customer_event_schema,
    p1_source_payload_max_bytes,
    p1_synchronization_job_schema,
    parse_p1_source_customer_event,
} from "./synchronization_contracts";

const valid_source_event = Object.freeze({
    p1_customer: {
        p1_email: "ada@example.test",
        p1_external_id: "commerce_customer_101",
        p1_first_name: "Ada",
        p1_last_name: "Lovelace",
        p1_updated_at: "2026-09-04T22:00:00.000Z",
    },
    p1_event_type: "commerce.customer.updated",
    p1_idempotency_key: "event:101",
});

describe("synchronization contracts", () => {
    // These checks fix the accepted shape and reject unknown, oversized, and malformed inputs.
    it("accepts the exact source, mapped customer, and identifier-only job contracts", () => {
        const source_event = parse_p1_source_customer_event(valid_source_event);
        const mapped_customer = p1_mapped_customer_schema.parse({
            p1_email: source_event.p1_customer.p1_email,
            p1_external_id: source_event.p1_customer.p1_external_id,
            p1_first_name: source_event.p1_customer.p1_first_name,
            p1_last_name: source_event.p1_customer.p1_last_name,
            p1_source_updated_at: source_event.p1_customer.p1_updated_at,
        });
        const job = p1_synchronization_job_schema.parse({
            p1_correlation_id: randomUUID(),
            p1_run_id: randomUUID(),
            p1_source_event_id: randomUUID(),
            p1_workspace_id: randomUUID(),
        });

        expect(Object.isFrozen(source_event)).toBe(true);
        expect(mapped_customer.p1_external_id).toBe("commerce_customer_101");
        expect(Object.keys(job)).toHaveLength(4);
    });

    it("rejects unknown fields and invalid idempotency keys", () => {
        expect(() =>
            p1_source_customer_event_schema.parse({ ...valid_source_event, unexpected: true }),
        ).toThrow(/./u);
        expect(() =>
            p1_source_customer_event_schema.parse({
                ...valid_source_event,
                p1_idempotency_key: "contains whitespace",
            }),
        ).toThrow(/./u);
    });

    it("rejects source fields beyond their accepted boundary", () => {
        const invalid_event = {
            ...valid_source_event,
            p1_customer: {
                ...valid_source_event.p1_customer,
                p1_first_name: "a".repeat(81),
            },
        };

        expect(Buffer.byteLength(JSON.stringify(invalid_event))).toBeLessThan(
            p1_source_payload_max_bytes,
        );
        expect(() => p1_source_customer_event_schema.parse(invalid_event)).toThrow(/./u);
    });

    it("rejects raw customer data in a job payload", () => {
        expect(() =>
            p1_synchronization_job_schema.parse({
                p1_correlation_id: randomUUID(),
                p1_customer_email: "secret@example.test",
                p1_run_id: randomUUID(),
                p1_source_event_id: randomUUID(),
                p1_workspace_id: randomUUID(),
            }),
        ).toThrow(/./u);
    });
});
