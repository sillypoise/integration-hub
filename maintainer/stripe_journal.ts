import { randomUUID } from "node:crypto";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import { constants } from "node:fs";
import { z } from "zod";
import { stripe_account_id, stripe_customer_id, stripe_probe } from "./stripe_source.ts";

const journal_path = ".tools/stripe-evidence.json";
const journal_schema = stripe_probe
    .extend({
        account_id: stripe_account_id,
        customer_id: stripe_customer_id.optional(),
        workspace_id: z.uuid().optional(),
    })
    .strict();
export type StripeJournal = z.infer<typeof journal_schema>;

export async function lock_stripe_journal(): Promise<() => Promise<void>> {
    await mkdir(".tools", { recursive: true });
    const handle = await open(".tools/stripe-evidence.lock", "wx", 0o600);
    await handle.close();
    return async () => {
        await unlink(".tools/stripe-evidence.lock");
    };
}

export async function load_stripe_journal(account_id: string): Promise<StripeJournal> {
    stripe_account_id.parse(account_id);
    let handle;
    try {
        handle = await open(journal_path, constants.O_RDONLY | constants.O_NOFOLLOW);
    } catch (error: unknown) {
        if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
        const journal = {
            account_id,
            operation_id: randomUUID(),
            started_at: new Date().toISOString(),
        };
        await save_stripe_journal(journal);
        return journal;
    }
    try {
        const metadata = await handle.stat();
        if (!metadata.isFile() || metadata.size > 1024) throw new Error("Invalid fixture journal.");
        const journal = journal_schema.parse(JSON.parse(await handle.readFile("utf8")));
        if (journal.account_id !== account_id) throw new Error("Fixture account changed.");
        return journal;
    } finally {
        await handle.close();
    }
}

export async function save_stripe_journal(journal: StripeJournal): Promise<void> {
    const validated = journal_schema.parse(journal);
    // Sync the replacement and its directory before a dependent remote operation can start.
    const handle = await open(
        `${journal_path}.next`,
        constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW,
        0o600,
    );
    try {
        await handle.writeFile(JSON.stringify(validated), "utf8");
        await handle.sync();
    } finally {
        await handle.close();
    }
    await rename(`${journal_path}.next`, journal_path);
    const directory = await open(".tools", constants.O_RDONLY);
    try {
        await directory.sync();
    } finally {
        await directory.close();
    }
}

export async function remove_stripe_journal(): Promise<void> {
    await unlink(journal_path);
    const directory = await open(".tools", constants.O_RDONLY);
    try {
        await directory.sync();
    } finally {
        await directory.close();
    }
}
