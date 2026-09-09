import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as source from "./stripe_source.ts";
import { cleanup_stripe_fixture, ensure_stripe_fixture } from "./stripe_fixture.ts";
import { test_customer, test_key, test_probe, test_journal } from "./stripe_test_fixture.ts";

const journal = vi.hoisted(() => ({
    save: vi.fn<() => Promise<void>>(),
    remove: vi.fn<() => Promise<void>>(),
}));
vi.mock("./stripe_journal.ts", () => ({
    save_stripe_journal: journal.save,
    remove_stripe_journal: journal.remove,
}));
beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(test_probe.started_at);
});
afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

// Mock only provider/persistence boundaries: failed or ambiguous cleanup must preserve the journal.
it("persists ownership and reuses the key after unknown outcomes", async () => {
    const request = vi
        .spyOn(source, "request_stripe_fixture")
        .mockResolvedValueOnce({ ok: false, code: "DEPENDENCY_UNAVAILABLE", reason: "transport" })
        .mockResolvedValueOnce({ ok: true, body: test_customer() });
    await expect(ensure_stripe_fixture(test_key, test_journal)).rejects.toThrow(
        "Stripe create denied: transport",
    );
    expect(journal.save).not.toHaveBeenCalled();
    expect((await ensure_stripe_fixture(test_key, test_journal)).customer_id).toBe("cus_p1fixture");
    expect(request.mock.calls[0]).toEqual(request.mock.calls[1]);
    expect(journal.save).toHaveBeenCalledOnce();
});

it.each([-1, 23 * 60 * 60 * 1000])("refuses unsafe create replay age %s", async (age_ms) => {
    vi.setSystemTime(Date.parse(test_probe.started_at) + age_ms);
    const request = vi.spyOn(source, "request_stripe_fixture");
    await expect(ensure_stripe_fixture(test_key, test_journal)).rejects.toThrow("Stale");
    expect(request).not.toHaveBeenCalled();
});

it("does not recreate a known customer", async () => {
    const request = vi.spyOn(source, "request_stripe_fixture");
    const known = { ...test_journal, customer_id: "cus_p1fixture" };
    expect(await ensure_stripe_fixture(test_key, known)).toEqual(known);
    expect(request).not.toHaveBeenCalled();
});

it("refuses deletion when ownership no longer matches", async () => {
    const request = vi.spyOn(source, "request_stripe_fixture").mockResolvedValue({
        ok: true,
        body: { ...test_customer(), metadata: { p1_stripe_probe: "foreign" } },
    });
    await expect(
        cleanup_stripe_fixture(test_key, { ...test_journal, customer_id: "cus_p1fixture" }),
    ).rejects.toThrow("ownership");
    expect(request).toHaveBeenCalledOnce();
    expect(journal.remove).not.toHaveBeenCalled();
});

it("retains the journal if deletion has an unknown outcome", async () => {
    vi.spyOn(source, "request_stripe_fixture")
        .mockResolvedValueOnce({ ok: true, body: test_customer() })
        .mockResolvedValueOnce({ ok: false, code: "DEPENDENCY_UNAVAILABLE", reason: "transport" });
    await expect(
        cleanup_stripe_fixture(test_key, { ...test_journal, customer_id: "cus_p1fixture" }),
    ).rejects.toThrow("unverified");
    expect(journal.remove).not.toHaveBeenCalled();
});

it.each([false, true])(
    "confirms cleanup, including interrupted deletion: %s",
    async (already_deleted) => {
        const receipt = { id: "cus_p1fixture", object: "customer", deleted: true };
        const request = vi
            .spyOn(source, "request_stripe_fixture")
            .mockResolvedValueOnce({ ok: true, body: already_deleted ? receipt : test_customer() })
            .mockResolvedValueOnce({ ok: true, body: receipt });
        await cleanup_stripe_fixture(test_key, { ...test_journal, customer_id: receipt.id });
        expect(journal.remove).toHaveBeenCalledOnce();
        expect(request).toHaveBeenCalledTimes(already_deleted ? 1 : 2);
    },
);
