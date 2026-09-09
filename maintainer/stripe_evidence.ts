import {
    request_stripe_fixture,
    request_stripe_account,
    stripe_account_schema,
    parse_stripe_fixture,
    stripe_fixture_deleted,
} from "./stripe_source.ts";
import { load_stripe_journal, lock_stripe_journal, save_stripe_journal } from "./stripe_journal.ts";
import { ensure_stripe_fixture, cleanup_stripe_fixture, probe_of } from "./stripe_fixture.ts";
import { read_stripe_evidence_key } from "./stripe_configuration.ts";
import { synchronize_stripe_fixture } from "./stripe_sync.ts";
import { start_job_runtime, stop_job_runtime } from "../src/lib/jobs/job_runtime.ts";
import { create_p1_demo_workspace } from "../src/lib/workspaces/workspace_repository.ts";

async function run_stripe_evidence(): Promise<void> {
    const key = read_stripe_evidence_key({
        environment: process.env,
        confirmation: process.argv[2],
    });

    let account_id: string;
    {
        // Retain only the verified account ID, not the provider's other account fields.
        const account = await request_stripe_account(key);
        if (!account.ok) throw new Error("Stripe account authentication failed.");
        const identity = stripe_account_schema.safeParse(account.body);
        if (!identity.success) throw new Error("Invalid Stripe account identity.");
        account_id = identity.data.id;
    }

    const unlock = await lock_stripe_journal();
    try {
        let journal = await ensure_stripe_fixture(key, await load_stripe_journal(account_id));
        try {
            const read = await request_stripe_fixture({
                key,
                probe: probe_of(journal),
                operation: "read",
                customer_id: journal.customer_id,
            });
            if (!read.ok) throw new Error(`Stripe read denied: ${read.reason}`);
            if (stripe_fixture_deleted(read.body, journal.customer_id)) {
                process.stdout.write('{"stripe_evidence":"previous_fixture_already_deleted"}\n');
                return;
            }
            const source = parse_stripe_fixture(read.body, probe_of(journal), journal.customer_id);
            if (source === null) throw new Error("Invalid owned fixture response.");
            await start_job_runtime();
            let workspace_id = journal.workspace_id;
            if (workspace_id === undefined) {
                const workspace = await create_p1_demo_workspace({ current_time: new Date() });
                if (!workspace.ok) throw new Error("Local workspace admission rejected.");
                workspace_id = workspace.p1_workspace_id;
                journal = { ...journal, workspace_id };
                await save_stripe_journal(journal);
            }
            const run_id = await synchronize_stripe_fixture(source, workspace_id);
            process.stdout.write(JSON.stringify({ stripe_sync: "verified", run_id }) + "\n");
        } finally {
            // Failed worker shutdown still permits cleanup; unknown outcomes retain the journal.
            try {
                await stop_job_runtime();
            } finally {
                await cleanup_stripe_fixture(key, journal);
            }
        }
    } finally {
        await unlock();
    }
}

run_stripe_evidence().catch(() => {
    // Never print provider bodies, credentials, arbitrary error objects, or configuration values.
    process.stderr.write('{"code":"STRIPE_EVIDENCE_FAILED","journal":"inspect if present"}\n');
    process.exitCode = 1;
});
