import { mkdtemp, rm, writeFile, readFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
    load_stripe_journal,
    lock_stripe_journal,
    save_stripe_journal,
    remove_stripe_journal,
} from "./stripe_journal.ts";

const original_directory = process.cwd();
let directory: string;
beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "p1-stripe-journal-"));
    process.chdir(directory);
});
afterEach(async () => {
    process.chdir(original_directory);
    await rm(directory, { recursive: true, force: true });
});

// Temporary files verify locking, durable replay identity, and invalid journal rejection.
it("preserves replay identity and ownership across reload", async () => {
    const unlock = await lock_stripe_journal();
    try {
        await expect(lock_stripe_journal()).rejects.toThrow("EEXIST");
        const initial = await load_stripe_journal("acct_fixture");
        expect(await load_stripe_journal("acct_fixture")).toEqual(initial);
        await expect(load_stripe_journal("acct_other")).rejects.toThrow("account changed");
        await save_stripe_journal({ ...initial, customer_id: "cus_owned" });
        expect((await load_stripe_journal("acct_fixture")).customer_id).toBe("cus_owned");
        await remove_stripe_journal();
        expect((await load_stripe_journal("acct_fixture")).operation_id).not.toBe(
            initial.operation_id,
        );
    } finally {
        await unlock();
    }
});

it("rejects symlinks and preserves state after interrupted replacement", async () => {
    const unlock = await lock_stripe_journal();
    try {
        await writeFile("outside.json", "sentinel", "utf8");
        await symlink("../outside.json", ".tools/stripe-evidence.json");
        await expect(load_stripe_journal("acct_fixture")).rejects.toThrow("ELOOP");
        expect(await readFile("outside.json", "utf8")).toBe("sentinel");
        await rm(".tools/stripe-evidence.json");
        const initial = await load_stripe_journal("acct_fixture");
        await writeFile(".tools/stripe-evidence.json.next", "{interrupted", "utf8");
        expect(await load_stripe_journal("acct_fixture")).toEqual(initial);
        await rm(".tools/stripe-evidence.json.next");
        await symlink("../outside.json", ".tools/stripe-evidence.json.next");
        await expect(save_stripe_journal(initial)).rejects.toThrow("ELOOP");
        expect(await load_stripe_journal("acct_fixture")).toEqual(initial);
        expect(await readFile("outside.json", "utf8")).toBe("sentinel");
    } finally {
        await unlock();
    }
});

it.each(["not JSON", "x".repeat(1025), '{"operation_id":"foreign"}'])(
    "refuses malformed journal input without replacing it",
    async (body) => {
        const unlock = await lock_stripe_journal();
        try {
            await writeFile(".tools/stripe-evidence.json", body, "utf8");
            await expect(load_stripe_journal("acct_fixture")).rejects.toThrow(Error);
            expect(await readFile(".tools/stripe-evidence.json", "utf8")).toBe(body);
        } finally {
            await unlock();
        }
    },
);
