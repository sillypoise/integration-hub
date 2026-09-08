import assert from "node:assert/strict";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { read_server_environment } from "../lib/config/server_environment.ts";
import { p1_acceptance_view, p1_run_detail_view } from "../lib/contracts/demo_views.ts";

const execute = promisify(execFile);
const origin = "http://127.0.0.1:3105";

async function check_local_outage() {
    const server = await outage_start_server();
    let paused = false;
    try {
        await outage_wait_ready();
        const created = await fetch(`${origin}/api/demo/workspaces`, {
            method: "POST",
            headers: { origin },
            signal: AbortSignal.timeout(5_000),
        });
        assert.equal(created.status, 201);
        const cookie = created.headers.get("set-cookie")?.split(";")[0];
        assert.ok(cookie);
        const accepted = await fetch(`${origin}/api/demo/events`, {
            method: "POST",
            headers: { origin, cookie, "content-type": "application/json" },
            body: JSON.stringify({
                p1_customer_number: 1,
                p1_revision: 1,
                p1_scenario: "rate_limit",
            }),
            signal: AbortSignal.timeout(5_000),
        });
        assert.equal(accepted.status, 202);
        const body = p1_acceptance_view.parse(await accepted.json());
        assert.match(body.p1_run_id, /^[a-f0-9-]{36}$/u);
        await outage_wait_state(body.p1_run_id, cookie, "retryable_failure", 20);
        await execute("podman", ["pause", "integration-hub-postgres"], { timeout: 5_000 });
        paused = true;
        const responses = await Promise.all(
            ["/health/live", "/health/ready", "/api/demo/overview"].map((path) =>
                fetch(`${origin}${path}`, {
                    headers: { cookie },
                    signal: AbortSignal.timeout(8_000),
                }),
            ),
        );
        assert.deepEqual(
            responses.map((response) => response.status),
            [200, 503, 503],
        );
        assert.deepEqual(await responses[1]?.json(), { code: "DEPENDENCY_UNAVAILABLE" });
        assert.deepEqual(await responses[2]?.json(), { code: "DEPENDENCY_UNAVAILABLE" });
        await execute("podman", ["unpause", "integration-hub-postgres"], { timeout: 5_000 });
        paused = false;
        await outage_wait_ready();
        await outage_wait_state(body.p1_run_id, cookie, "succeeded", 180);
        process.stdout.write(
            JSON.stringify({
                outage_check: "passed",
                liveness: 200,
                readiness_during_outage: 503,
                overview_during_outage: 503,
                recovered_run: body.p1_run_id,
            }) + "\n",
        );
    } finally {
        try {
            if (paused) {
                await execute("podman", ["unpause", "integration-hub-postgres"], {
                    timeout: 5_000,
                });
            }
        } finally {
            await outage_stop_server(server);
        }
    }
}

async function outage_start_server() {
    const environment = read_server_environment(process.env);
    const database = new URL(environment.DATABASE_URL);
    assert.equal(database.hostname, "127.0.0.1");
    assert.equal(database.port, "5432");
    assert.equal(database.pathname, "/integration_hub");
    assert.equal(environment.DATABASE_SSL, "disable");
    // Refuse to run against a pre-existing process on the drill's dedicated loopback port.
    const probe = createServer();
    await new Promise<void>((resolve, reject) => {
        probe.once("error", reject);
        probe.listen(3105, "127.0.0.1", resolve);
    });
    await new Promise<void>((resolve, reject) =>
        probe.close((error) => (error ? reject(error) : resolve())),
    );
    return spawn(process.execPath, ["src/server.ts"], {
        env: {
            ...environment,
            PORT: "3105",
            NODE_ENV: "production",
            APPLICATION_ORIGIN: origin,
            SERVER_HOST: "127.0.0.1",
            PATH: process.env.PATH,
        },
        stdio: "ignore",
    });
}

async function outage_wait_ready() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        try {
            // Readiness must recover without cached success; sequential probes bound open sockets.
            // oxlint-disable-next-line no-await-in-loop
            const response = await fetch(`${origin}/health/ready`, {
                signal: AbortSignal.timeout(3_000),
            });
            if (response.status === 200) return;
        } catch {
            /* Startup may not yet have opened its private test socket. */
        }
        // oxlint-disable-next-line no-await-in-loop
        await delay(500);
    }
    throw new Error("Local readiness deadline exceeded.");
}
async function outage_wait_state(run_id: string, cookie: string, state: string, limit: number) {
    assert.ok(limit <= 180);
    for (let attempt = 0; attempt < limit; attempt += 1) {
        // oxlint-disable-next-line no-await-in-loop
        const response = await fetch(`${origin}/api/demo/runs/${run_id}`, {
            headers: { cookie },
            signal: AbortSignal.timeout(5_000),
        });
        assert.equal(response.status, 200);
        // oxlint-disable-next-line no-await-in-loop
        const body = p1_run_detail_view.parse(await response.json());
        if (body.p1_state === state) {
            if (state === "succeeded") {
                assert.equal(body.p1_attempt_count, 2);
                assert.equal(body.p1_attempts.length, 2);
                assert.ok(body.p1_destination);
            }
            return;
        }
        // oxlint-disable-next-line no-await-in-loop
        await delay(500);
    }
    throw new Error("Local recovery deadline exceeded.");
}
async function outage_stop_server(server: ChildProcess) {
    server.kill("SIGTERM");
    const force_stop = setTimeout(() => server.kill("SIGKILL"), 12_000);
    try {
        if (server.exitCode === null && server.signalCode === null) {
            await new Promise<void>((resolve) => server.once("exit", () => resolve()));
        }
    } finally {
        clearTimeout(force_stop);
    }
}

check_local_outage().catch(() => {
    process.stderr.write(
        "Local outage check failed. Verify that the project database is unpaused.\n",
    );
    process.exitCode = 1;
});
