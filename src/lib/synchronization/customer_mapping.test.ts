import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { create_p1_simulated_customer_event } from "../simulators/commerce_simulator.ts";
import { map_p1_customer_event } from "./customer_mapping.ts";

// Mapping must select only accepted customer fields, preserve source time, and never mutate input.
describe("customer event mapping", () => {
    const source = create_p1_simulated_customer_event({
        p1_customer_number: 1,
        p1_revision: 1,
    });

    it("maps exactly the destination contract without source envelope fields", () => {
        const mapped = map_p1_customer_event(source);
        expect(mapped).toEqual({
            p1_email: "customer-1@example.test",
            p1_external_id: "simulated_customer_1",
            p1_first_name: "Demo",
            p1_last_name: "Customer 1",
            p1_source_updated_at: "2026-01-01T00:00:01.000Z",
        });
        expect(Object.isFrozen(mapped)).toBe(true);
        expect(source.p1_customer).not.toHaveProperty("p1_source_updated_at");
        expect(map_p1_customer_event(source)).toEqual(mapped);
    });

    it("normalizes accepted whitespace and preserves an explicit source timezone", () => {
        const mapped = map_p1_customer_event({
            ...source,
            p1_customer: {
                ...source.p1_customer,
                p1_first_name: " Demo ",
                p1_updated_at: "2026-01-01T01:00:01+01:00",
            },
        });
        expect(mapped.p1_first_name).toBe("Demo");
        expect(mapped.p1_source_updated_at).toBe("2026-01-01T01:00:01+01:00");
    });

    it("accepts maximum supported identifier and name lengths", () => {
        const mapped = map_p1_customer_event({
            ...source,
            p1_customer: {
                ...source.p1_customer,
                p1_external_id: "x".repeat(64),
                p1_first_name: "x".repeat(80),
                p1_last_name: "y".repeat(80),
            },
        });
        expect(mapped.p1_external_id).toHaveLength(64);
        expect(mapped.p1_first_name).toHaveLength(80);
        expect(mapped.p1_last_name).toHaveLength(80);
    });

    it.each([
        null,
        { ...source, credential: "not-accepted" },
        { ...source, p1_event_type: "unknown" },
        { ...source, p1_customer: { ...source.p1_customer, p1_email: "invalid" } },
        { ...source, p1_customer: { ...source.p1_customer, p1_first_name: " " } },
        {
            ...source,
            p1_customer: { ...source.p1_customer, p1_external_id: "x".repeat(65) },
        },
    ])("rejects unaccepted data before mapping %#", (input) => {
        expect(() => map_p1_customer_event(input)).toThrow(ZodError);
    });
});
