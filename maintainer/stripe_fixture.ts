import {
    request_stripe_fixture,
    parse_stripe_fixture,
    stripe_fixture_deleted,
} from "./stripe_source.ts";
import {
    save_stripe_journal,
    remove_stripe_journal,
    type StripeJournal,
} from "./stripe_journal.ts";

export function probe_of(journal: StripeJournal) {
    return { operation_id: journal.operation_id, started_at: journal.started_at };
}

export async function ensure_stripe_fixture(key: string, journal: StripeJournal) {
    if (journal.customer_id !== undefined) return { ...journal, customer_id: journal.customer_id };
    const age_ms = Date.now() - Date.parse(journal.started_at);
    // Stripe may prune idempotency keys after 24 hours. Never recreate an unknown stale outcome.
    if (age_ms < 0 || age_ms >= 23 * 60 * 60 * 1000) {
        throw new Error("Stale unknown fixture outcome.");
    }
    const created = await request_stripe_fixture({
        key,
        probe: probe_of(journal),
        operation: "create",
    });
    if (!created.ok) throw new Error(`Stripe create denied: ${created.reason}`);
    const source = parse_stripe_fixture(created.body, probe_of(journal));
    if (source === null) throw new Error("Invalid create response; journal retained.");
    const updated = { ...journal, customer_id: source.p1_customer.p1_external_id };
    await save_stripe_journal(updated);
    return updated;
}

export async function cleanup_stripe_fixture(key: string, journal: StripeJournal): Promise<void> {
    if (journal.customer_id === undefined) throw new Error("Unknown fixture outcome.");
    const options = { key, probe: probe_of(journal), customer_id: journal.customer_id };
    const current = await request_stripe_fixture({ ...options, operation: "read" });
    if (!current.ok) throw new Error("Cleanup read failed; journal retained.");
    if (!stripe_fixture_deleted(current.body, journal.customer_id)) {
        if (parse_stripe_fixture(current.body, probe_of(journal), journal.customer_id) === null) {
            throw new Error("Cleanup ownership rejected; journal retained.");
        }
        const deleted = await request_stripe_fixture({ ...options, operation: "delete" });
        if (!deleted.ok || !stripe_fixture_deleted(deleted.body, journal.customer_id)) {
            throw new Error("Cleanup outcome unverified; journal retained.");
        }
    }
    await remove_stripe_journal();
    process.stdout.write('{"stripe_cleanup":"verified"}\n');
}
