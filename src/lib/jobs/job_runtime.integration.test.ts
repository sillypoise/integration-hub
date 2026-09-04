import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
    find_diagnostic_job,
    send_diagnostic_job,
    start_job_runtime,
    stop_job_runtime,
} from "./job_runtime";

describe("job runtime lifecycle", () => {
    // These tests exercise the real PostgreSQL queue and prove bounded restart recovery.
    afterEach(async () => {
        await stop_job_runtime();
    });

    it("completes a queued job once after a worker restart", async () => {
        await start_job_runtime();
        const job_id = await send_diagnostic_job({ p1_delay_ms: 0, p1_probe_id: randomUUID() }, 1);
        await stop_job_runtime();

        await start_job_runtime();
        let completed_job = await find_diagnostic_job(job_id);

        await vi.waitFor(
            async () => {
                completed_job = await find_diagnostic_job(job_id);

                if (completed_job?.state === "completed") {
                    return;
                }

                throw new Error("Diagnostic job is not complete yet.");
            },
            { interval: 250, timeout: 5_000 },
        );

        expect(completed_job?.id).toBe(job_id);
        expect(completed_job?.state).toBe("completed");
        expect(completed_job?.output).toEqual({ p1_processed: true });
    }, 15_000);

    it("rejects a diagnostic payload beyond its delay boundary", async () => {
        await start_job_runtime();

        await expect(
            send_diagnostic_job({ p1_delay_ms: 5_001, p1_probe_id: randomUUID() }, 0),
        ).rejects.toThrow("Too big");
    });
});
