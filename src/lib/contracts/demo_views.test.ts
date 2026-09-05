import { expect, it } from "vitest";
import {
    p1_detail_is_active,
    p1_run_category,
    p1_run_detail_view,
    p1_overview_view,
} from "./demo_views.ts";

const run = p1_run_detail_view.parse({
    p1_run_id: "10000000-0000-4000-8000-000000000001",
    p1_source_event_id: "10000000-0000-4000-8000-000000000002",
    p1_correlation_id: "10000000-0000-4000-8000-000000000001",
    p1_state: "queued",
    p1_delivery_state: "created",
    p1_attempt_count: 0,
    p1_created_at: "2026-01-01T00:00:00Z",
    p1_completed_at: null,
    p1_next_attempt_at: null,
    p1_destination_mode: "simulated",
    p1_destination: null,
    p1_attempts: [],
    p1_source: {
        p1_event_type: "commerce.customer.updated",
        p1_external_id: "customer_1",
        p1_updated_at: "2026-01-01T00:00:00Z",
    },
});

// Terminal domain success takes precedence over delivery ACK failures; only active work is polled.
it.each(["queued", "processing"] as const)("polls an active %s run", (p1_state) => {
    expect(p1_detail_is_active({ ...run, p1_state })).toBe(true);
    expect(p1_run_category({ ...run, p1_state })).toBe("pending");
});
it.each(["succeeded", "terminal_failure", "retryable_failure"] as const)(
    "stops polling domain state %s",
    (p1_state) => {
        expect(p1_detail_is_active({ ...run, p1_state })).toBe(false);
    },
);
it.each(["failed", "cancelled"] as const)(
    "marks %s delivery for attention",
    (p1_delivery_state) => {
        expect(p1_run_category({ ...run, p1_delivery_state })).toBe("attention");
        expect(p1_detail_is_active({ ...run, p1_delivery_state })).toBe(false);
        expect(p1_run_category({ ...run, p1_state: "succeeded", p1_delivery_state })).toBe(
            "succeeded",
        );
    },
);
it.each([null, "completed"] as const)(
    "does not poll an unavailable delivery %s",
    (p1_delivery_state) => {
        expect(p1_detail_is_active({ ...run, p1_delivery_state })).toBe(false);
    },
);
it("rejects incompatible modes, invalid dates, excessive attempts, and aggregate bounds", () => {
    expect(p1_run_detail_view.safeParse({ ...run, p1_destination_mode: "real" }).success).toBe(
        false,
    );
    expect(p1_run_detail_view.safeParse({ ...run, p1_created_at: "bad" }).success).toBe(false);
    expect(p1_run_detail_view.safeParse({ ...run, p1_attempt_count: 4 }).success).toBe(false);
    expect(p1_overview_view.safeParse({ p1_total: 1001 }).success).toBe(false);
});
