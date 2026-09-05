import { expect, it } from "vitest";
import { p1_scenario_schema } from "../contracts/recovery.ts";
import { simulate_p1_destination_failure } from "./failure_simulator.ts";
import { create_p1_simulated_customer_event } from "./commerce_simulator.ts";

// Exhaust every admitted scenario/attempt combination; restoration never changes customer identity.
it.each(p1_scenario_schema.options)(
    "bounds deterministic %s and restores only by explicit manual flag",
    (p1_scenario) => {
        for (let p1_attempt_number = 1; p1_attempt_number <= 4; p1_attempt_number += 1) {
            expect(
                simulate_p1_destination_failure({
                    p1_scenario,
                    p1_attempt_number,
                    p1_manual_retry_count: 1,
                }),
            ).toBeNull();
        }
        const base = create_p1_simulated_customer_event({
            p1_customer_number: 1_000,
            p1_revision: 1_000,
        });
        const scenario = create_p1_simulated_customer_event({
            p1_customer_number: 1_000,
            p1_revision: 1_000,
            p1_scenario,
        });
        expect(scenario.p1_customer).toEqual(base.p1_customer);
        expect(scenario.p1_idempotency_key.length).toBeLessThanOrEqual(64);
        expect(scenario.p1_idempotency_key === base.p1_idempotency_key).toBe(
            p1_scenario === "success",
        );
    },
);
it.each([0, 5, 1.5, Number.NaN])("rejects invalid attempt %s", (p1_attempt_number) => {
    expect(() =>
        simulate_p1_destination_failure({
            p1_scenario: "success",
            p1_attempt_number,
            p1_manual_retry_count: 0,
        }),
    ).toThrow(/assert|evaluated/u);
});
it("rejects unsupported scenarios, raw provider configuration, and invalid manual count", () => {
    expect(() =>
        create_p1_simulated_customer_event({
            p1_customer_number: 1,
            p1_revision: 1,
            p1_scenario: "real",
        }),
    ).toThrow(/Invalid/u);
    expect(() =>
        simulate_p1_destination_failure({
            p1_scenario: "success",
            p1_attempt_number: 1,
            p1_manual_retry_count: 2,
        }),
    ).toThrow(/assert|evaluated/u);
    expect(
        simulate_p1_destination_failure({
            p1_scenario: "rate_limit",
            p1_attempt_number: 3,
            p1_manual_retry_count: 0,
        }),
    ).toBeNull();
});
