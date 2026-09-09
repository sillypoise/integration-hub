import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import type { P1SourceCustomerEvent } from "../src/lib/contracts/synchronization_contracts.ts";
import {
    accept_p1_source_event,
    find_p1_synchronization_run,
} from "../src/lib/synchronization/synchronization_repository.ts";
import { process_p1_synchronization } from "../src/lib/synchronization/synchronization_worker.ts";
import { read_p1_synchronization_detail } from "../src/lib/synchronization/synchronization_queries.ts";
import { map_p1_customer_event } from "../src/lib/synchronization/customer_mapping.ts";

// Reuse ordinary transactional intake and the running durable worker, including duplicate delivery.
export async function synchronize_stripe_fixture(
    source: P1SourceCustomerEvent,
    workspace_id: string,
): Promise<string> {
    const options = { current_time: new Date(), p1_workspace_id: workspace_id };
    const accepted = await accept_p1_source_event(source, options);
    if (!accepted.ok) throw new Error("Local admission rejected.");
    const replayed = await accept_p1_source_event(source, options);
    if (!replayed.ok) throw new Error("Local replay rejected.");
    assert.equal(replayed.value.duplicate, true);
    assert.equal(replayed.value.p1_run_id, accepted.value.p1_run_id);
    const job = {
        ...accepted.value,
        p1_workspace_id: workspace_id,
        p1_correlation_id: accepted.value.p1_run_id,
    };
    for (let poll = 0; poll < 40; poll += 1) {
        // Database calls retain their existing deadlines; the CLI also has an outer budget.
        // oxlint-disable-next-line no-await-in-loop
        const state = await find_p1_synchronization_run(job);
        if (state?.p1_state === "succeeded") {
            // oxlint-disable-next-line no-await-in-loop
            const detail = await read_p1_synchronization_detail(job);
            assert.deepEqual(detail?.p1_destination, map_p1_customer_event(source));
            // oxlint-disable-next-line no-await-in-loop
            const replay = await process_p1_synchronization({
                p1_run_id: job.p1_run_id,
                p1_source_event_id: job.p1_source_event_id,
                p1_workspace_id: workspace_id,
                p1_correlation_id: job.p1_run_id,
            });
            assert.equal(replay, "ignored");
            assert.equal(state.p1_attempt_count, 1);
            return job.p1_run_id;
        }
        // oxlint-disable-next-line no-await-in-loop
        await delay(250);
    }
    throw new Error("Local synchronization deadline exceeded.");
}
