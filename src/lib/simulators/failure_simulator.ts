import assert from "node:assert/strict";
import { p1_scenario_schema, type P1Scenario } from "../contracts/recovery.ts";

export function simulate_p1_destination_failure(
    options: Readonly<{
        p1_scenario: P1Scenario;
        p1_attempt_number: number;
        p1_manual_retry_count: number;
    }>,
): "SIMULATED_RATE_LIMIT" | "SIMULATED_OUTAGE" | "SIMULATED_INVALID_DESTINATION" | null {
    p1_scenario_schema.parse(options.p1_scenario);
    assert.ok(Number.isInteger(options.p1_attempt_number));
    assert.ok(options.p1_attempt_number >= 1);
    assert.ok(options.p1_attempt_number <= 4);
    assert.ok(options.p1_manual_retry_count === 0 || options.p1_manual_retry_count === 1);
    // The explicitly requested manual retry restores only this run's simulated destination.
    if (options.p1_manual_retry_count === 1) return null;
    if (options.p1_scenario === "invalid_destination") return "SIMULATED_INVALID_DESTINATION";
    if (options.p1_scenario === "persistent_outage") return "SIMULATED_OUTAGE";
    if (options.p1_scenario === "temporary_outage") {
        if (options.p1_attempt_number <= 2) return "SIMULATED_OUTAGE";
    }
    if (options.p1_scenario === "rate_limit") {
        if (options.p1_attempt_number === 1) return "SIMULATED_RATE_LIMIT";
    }
    return null;
}
