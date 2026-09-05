import assert from "node:assert/strict";
import { z } from "zod";

import {
    parse_p1_source_customer_event,
    type P1SourceCustomerEvent,
} from "../contracts/synchronization_contracts.ts";

export const p1_commerce_simulator_input_schema = z
    .object({
        p1_customer_number: z.number().int().min(1).max(1_000),
        p1_revision: z.number().int().min(1).max(1_000),
    })
    .strict();

export function create_p1_simulated_customer_event(input: unknown): P1SourceCustomerEvent {
    const options = p1_commerce_simulator_input_schema.parse(input);
    assert.ok(Number.isSafeInteger(options.p1_customer_number));
    assert.ok(Number.isSafeInteger(options.p1_revision));

    // Fixed synthetic identities and logical timestamps make replay independent of wall time.
    const source_updated_at = new Date(
        Date.UTC(2026, 0, 1) + options.p1_revision * 1_000,
    ).toISOString();
    const event = parse_p1_source_customer_event({
        p1_customer: {
            p1_email: `customer-${options.p1_customer_number}@example.test`,
            p1_external_id: `simulated_customer_${options.p1_customer_number}`,
            p1_first_name: "Demo",
            p1_last_name: `Customer ${options.p1_customer_number}`,
            p1_updated_at: source_updated_at,
        },
        p1_event_type: "commerce.customer.updated",
        p1_idempotency_key: `simulated_customer_${options.p1_customer_number}:revision_${options.p1_revision}`,
    });

    assert.ok(event.p1_customer.p1_email.endsWith("@example.test"));
    assert.ok(event.p1_idempotency_key.length <= 64);
    Object.freeze(event.p1_customer);
    return event;
}
