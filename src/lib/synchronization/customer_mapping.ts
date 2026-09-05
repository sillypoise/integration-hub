import assert from "node:assert/strict";

import {
    p1_mapped_customer_schema,
    parse_p1_source_customer_event,
    type P1MappedCustomer,
} from "../contracts/synchronization_contracts.ts";

export function map_p1_customer_event(input: unknown): P1MappedCustomer {
    const source = parse_p1_source_customer_event(input);
    assert.equal(source.p1_event_type, "commerce.customer.updated");
    assert.ok(source.p1_customer.p1_external_id.length > 0);

    // Explicit selection prevents future source-only fields from reaching the destination.
    const customer = p1_mapped_customer_schema.parse({
        p1_email: source.p1_customer.p1_email,
        p1_external_id: source.p1_customer.p1_external_id,
        p1_first_name: source.p1_customer.p1_first_name,
        p1_last_name: source.p1_customer.p1_last_name,
        p1_source_updated_at: source.p1_customer.p1_updated_at,
    });

    assert.equal(customer.p1_external_id, source.p1_customer.p1_external_id);
    assert.equal(customer.p1_source_updated_at, source.p1_customer.p1_updated_at);
    return Object.freeze(customer);
}
