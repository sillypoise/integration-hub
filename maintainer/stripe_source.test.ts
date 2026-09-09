import assert from "node:assert/strict";
import { afterEach, expect, it, vi } from "vitest";
import {
    parse_stripe_fixture,
    request_stripe_fixture,
    stripe_fixture_deleted,
    stripe_version,
    request_stripe_account,
    stripe_account_schema,
} from "./stripe_source.ts";
import { test_customer, test_key, test_probe, test_response } from "./stripe_test_fixture.ts";

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

// No real Stripe calls: test endpoint/credential gates, bounded responses, and safe errors.
it.each(["", "sk_live_forbidden", "sk_test_bad\nheader", "sk_test_" + "x".repeat(241)])(
    "rejects invalid credential shape %s before transport",
    async (key) => {
        const transport = vi.fn<typeof fetch>();
        expect(
            await request_stripe_fixture(
                { key, probe: test_probe, operation: "create" },
                transport,
            ),
        ).toMatchObject({ ok: false, reason: "configuration" });
        expect(transport).not.toHaveBeenCalled();
    },
);

it.each(["../customers", "cus_x?expand=anything", "", "cus_" + "x".repeat(51)])(
    "rejects invalid customer identifier %s",
    async (customer_id) => {
        const transport = vi.fn<typeof fetch>();
        expect(
            await request_stripe_fixture(
                { key: test_key, probe: test_probe, operation: "read", customer_id },
                transport,
            ),
        ).toMatchObject({ ok: false });
        expect(transport).not.toHaveBeenCalled();
    },
);

it.each(["create", "read", "delete"] as const)(
    "constrains %s to its fixed HTTP contract",
    async (operation) => {
        const transport = vi.fn<typeof fetch>().mockResolvedValue(test_response(test_customer()));
        expect(
            (
                await request_stripe_fixture(
                    { key: test_key, probe: test_probe, operation, customer_id: "cus_p1fixture" },
                    transport,
                )
            ).ok,
        ).toBe(true);
        const options = transport.mock.calls[0]?.[1];
        expect(options?.redirect).toBe("error");
        expect(options?.cache).toBe("no-store");
        expect(new Headers(options?.headers).get("Stripe-Version")).toBe(stripe_version);
        expect(new Headers(options?.headers).get("Idempotency-Key")).toBe(
            operation === "create" ? `p1-stripe-${test_probe.operation_id}` : null,
        );
        expect(transport).toHaveBeenCalledOnce();
    },
);

it.each([
    [401, "authentication"],
    [403, "authentication"],
    [404, "not_found"],
    [429, "rate_limit"],
    [500, "provider"],
    [302, "provider"],
] as const)(
    "classifies HTTP %s without retrying or exposing provider bodies",
    async (status, reason) => {
        const transport = vi
            .fn<typeof fetch>()
            .mockResolvedValue(test_response({ secret: "sentinel" }, status));
        const result = await request_stripe_fixture(
            { key: test_key, probe: test_probe, operation: "create" },
            transport,
        );
        expect(result).toMatchObject({ ok: false, reason });
        expect(JSON.stringify(result)).not.toContain("sentinel");
        expect(transport).toHaveBeenCalledOnce();
    },
);

it("bounds slow transport and does not imply rollback after abort", async () => {
    vi.useFakeTimers();
    // Native AbortSignal timers bypass fake timers; substitute only that clock boundary.
    vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), milliseconds);
        return controller.signal;
    });
    const transport = vi.fn<typeof fetch>().mockImplementation(
        (_input, options) =>
            new Promise((_resolve, reject) => {
                options?.signal?.addEventListener("abort", () => reject(new Error("private")), {
                    once: true,
                });
            }),
    );
    const result = request_stripe_fixture(
        { key: test_key, probe: test_probe, operation: "create" },
        transport,
    );
    await vi.advanceTimersByTimeAsync(8000);
    expect(await result).toEqual({
        ok: false,
        code: "DEPENDENCY_UNAVAILABLE",
        reason: "transport",
    });
    expect(transport).toHaveBeenCalledOnce();
});

it("rejects oversized and non-JSON responses without leaking their content", async () => {
    for (const response of [
        test_response({ padding: "x".repeat(16_384) }),
        new Response("private", { headers: { "content-type": "text/plain" } }),
    ]) {
        const transport = vi.fn<typeof fetch>().mockResolvedValue(response);
        // oxlint-disable-next-line no-await-in-loop
        const result = await request_stripe_fixture(
            { key: test_key, probe: test_probe, operation: "create" },
            transport,
        );
        expect(result.ok).toBe(false);
    }
});

it("maps only a matching, test-mode synthetic snapshot and produces a bounded stable key", () => {
    const source = parse_stripe_fixture({ ...test_customer(), future_field: true }, test_probe);
    expect(source?.p1_customer.p1_external_id).toBe("cus_p1fixture");
    expect(source?.p1_customer.p1_first_name).toBe("Portfolio");
    expect(source?.p1_idempotency_key).toHaveLength(64);
    expect(source).toEqual(parse_stripe_fixture(test_customer(), test_probe));
    expect(parse_stripe_fixture(test_customer(), test_probe, "cus_other")).toBeNull();
});

it.each([
    { livemode: true },
    { name: null },
    { email: "real@example.com" },
    { metadata: {} },
    { id: "cus_" + "x".repeat(51) },
    { object: "deleted_customer" },
])("rejects non-fixture provider data", (override) => {
    expect(parse_stripe_fixture({ ...test_customer(), ...override }, test_probe)).toBeNull();
});

it("verifies the account without retaining other fields", async () => {
    const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
            test_response({ id: "acct_fixture", object: "account", private_field: "sentinel" }),
        );
    const result = await request_stripe_account(test_key, transport);
    expect(transport.mock.calls[0]?.[0]).toBe("https://api.stripe.com/v1/account");
    expect(transport.mock.calls[0]?.[1]?.method).toBe("GET");
    assert.ok(result.ok);
    expect(stripe_account_schema.parse(result.body)).toEqual({
        id: "acct_fixture",
        object: "account",
    });
    expect((await request_stripe_account("", transport)).ok).toBe(false);
    expect(transport).toHaveBeenCalledOnce();
});

it.each([0, 1])("checks the exact response byte boundary plus %s", async (extra_bytes) => {
    const text = JSON.stringify(test_customer()).padEnd(16384 + extra_bytes, " ");
    const response = new Response(text, { headers: { "content-type": "application/json" } });
    Object.defineProperty(response, "url", { value: "https://api.stripe.com/v1/customers" });
    const result = await request_stripe_fixture(
        { key: test_key, probe: test_probe, operation: "create" },
        vi.fn<typeof fetch>().mockResolvedValue(response),
    );
    expect(result.ok).toBe(extra_bytes === 0);
});

it("rejects invalid operation and probe metadata before sending any request", async () => {
    const transport = vi.fn<typeof fetch>();
    // @ts-expect-error Intentionally exercise an untyped caller's invalid operation.
    const invalid_operation: "delete" = "unsupported";
    expect(
        (
            await request_stripe_fixture(
                {
                    key: test_key,
                    probe: test_probe,
                    operation: invalid_operation,
                    customer_id: "cus_p1fixture",
                },
                transport,
            )
        ).ok,
    ).toBe(false);
    expect(
        (
            await request_stripe_fixture(
                {
                    key: test_key,
                    probe: { ...test_probe, started_at: "invalid" },
                    operation: "create",
                },
                transport,
            )
        ).ok,
    ).toBe(false);
    expect(transport).not.toHaveBeenCalled();
});

it("recognizes only a matching deletion receipt", () => {
    const receipt = { id: "cus_p1fixture", object: "customer", deleted: true };
    expect(stripe_fixture_deleted(receipt, receipt.id)).toBe(true);
    expect(stripe_fixture_deleted(receipt, "cus_foreign")).toBe(false);
    expect(stripe_fixture_deleted({ ...receipt, deleted: false }, receipt.id)).toBe(false);
});
