import { beforeEach, afterEach, vi } from "vitest";

// Any accidental fallback to the real transport must fail locally, never contact a provider.
beforeEach(() => {
    vi.stubGlobal(
        "fetch",
        vi.fn<typeof fetch>().mockRejectedValue(new Error("Offline transport only.")),
    );
});
afterEach(() => {
    vi.unstubAllGlobals();
});

export const test_key = "sk_test_syntheticfixtureonly";
export const test_probe = {
    operation_id: "8e5bd040-bd5d-4e04-a13f-b1b914f2d05d",
    started_at: "2026-09-05T00:00:00.000Z",
};
export const test_journal = { ...test_probe, account_id: "acct_fixture" };
export function test_customer() {
    return {
        id: "cus_p1fixture",
        object: "customer",
        livemode: false,
        name: "Portfolio Fixture",
        email: "stripe-fixture@example.test",
        metadata: {
            p1_stripe_probe: test_probe.operation_id,
            p1_updated_at: test_probe.started_at,
        },
    };
}
export function test_response(body: unknown, status = 200): Response {
    const response = Response.json(body, { status });
    Object.defineProperty(response, "url", {
        value: "https://api.stripe.com/v1/customers/cus_p1fixture",
    });
    return response;
}
