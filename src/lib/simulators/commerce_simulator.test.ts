import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { create_p1_simulated_customer_event } from "./commerce_simulator.ts";

// Repeated inputs must replay the same event without accepting personal data or provider authority.
describe("deterministic commerce simulator", () => {
    it("replays identical inputs and returns immutable synthetic data", () => {
        const input = { p1_customer_number: 1, p1_revision: 1 };
        const first = create_p1_simulated_customer_event(input);
        expect(create_p1_simulated_customer_event(input)).toEqual(first);
        expect(first.p1_customer.p1_email).toBe("customer-1@example.test");
        expect(first.p1_customer.p1_updated_at).toBe("2026-01-01T00:00:01.000Z");
        expect(Object.isFrozen(first)).toBe(true);
        expect(Object.isFrozen(first.p1_customer)).toBe(true);
        expect(input).toEqual({ p1_customer_number: 1, p1_revision: 1 });
    });

    it("changes the event key but preserves customer identity for a new revision", () => {
        const first = create_p1_simulated_customer_event({
            p1_customer_number: 1,
            p1_revision: 1,
        });
        const next = create_p1_simulated_customer_event({
            p1_customer_number: 1,
            p1_revision: 2,
        });
        expect(next.p1_customer.p1_external_id).toBe(first.p1_customer.p1_external_id);
        expect(next.p1_idempotency_key).not.toBe(first.p1_idempotency_key);
        expect(next.p1_customer.p1_updated_at > first.p1_customer.p1_updated_at).toBe(true);
    });

    it("accepts both upper limits without oversized identifiers", () => {
        const event = create_p1_simulated_customer_event({
            p1_customer_number: 1_000,
            p1_revision: 1_000,
        });
        expect(event.p1_idempotency_key.length).toBeLessThanOrEqual(64);
        expect(event.p1_customer.p1_external_id).toBe("simulated_customer_1000");
    });

    it.each([
        null,
        {},
        { p1_customer_number: 0, p1_revision: 1 },
        { p1_customer_number: 1_001, p1_revision: 1 },
        { p1_customer_number: 1.5, p1_revision: 1 },
        { p1_customer_number: "1", p1_revision: 1 },
        { p1_customer_number: 1, p1_revision: 0 },
        { p1_customer_number: 1, p1_revision: 1_001 },
        { p1_customer_number: 1, p1_revision: Number.NaN },
        { p1_customer_number: 1, p1_revision: Infinity },
        { p1_customer_number: 1, p1_revision: 1, p1_email: "personal@example.com" },
        { p1_customer_number: 1, p1_revision: 1, adapter: "stripe" },
    ])("rejects invalid or authority-bearing input %#", (input) => {
        expect(() => create_p1_simulated_customer_event(input)).toThrow(ZodError);
    });
});
