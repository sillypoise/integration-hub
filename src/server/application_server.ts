import assert from "node:assert/strict";
import { createServer, type Server, type ServerResponse } from "node:http";
import next from "next";

import { read_server_environment } from "../lib/config/server_environment.ts";
import { start_job_runtime, stop_job_runtime } from "../lib/jobs/job_runtime.ts";
import { application_logger } from "../lib/observability/application_logger.ts";
import { create_p1_http_guard } from "../lib/security/http_guard.ts";

export async function run_application_server(): Promise<void> {
    const environment = read_server_environment(process.env);
    const development_mode = environment.NODE_ENV === "development";
    const application = next({
        customServer: true,
        dev: development_mode,
        dir: process.cwd(),
        hostname: environment.SERVER_HOST,
        port: environment.PORT,
        quiet: false,
    });

    assert.ok(environment.PORT >= 1_024);
    assert.ok(environment.SERVER_HOST.length > 0);

    await application.prepare();
    await start_job_runtime();

    const request_handler = application.getRequestHandler();
    const guard = create_p1_http_guard(
        {
            production: !development_mode,
            https: environment.APPLICATION_ORIGIN.startsWith("https://"),
        },
        () => performance.now(),
    );
    const server = createServer(
        {
            headersTimeout: 5_000,
            requestTimeout: 10_000,
            keepAliveTimeout: 5_000,
            connectionsCheckingInterval: 1_000,
            maxHeaderSize: 8_192,
        },
        (request, response) => {
            const release = guard(request, response);
            if (release === null) return;
            request_handler(request, response)
                .catch(() => application_server_respond_error(response))
                .finally(release);
        },
    );
    server.maxConnections = 128;
    server.maxRequestsPerSocket = 100;

    const shutdown = application_server_create_shutdown(
        server,
        application.close.bind(application),
    );
    process.once("SIGINT", () => application_server_request_shutdown(shutdown, "SIGINT"));
    process.once("SIGTERM", () => application_server_request_shutdown(shutdown, "SIGTERM"));

    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(environment.PORT, environment.SERVER_HOST, resolve);
    });

    assert.equal(server.listening, true);
    application_logger.info(
        { host: environment.SERVER_HOST, port: environment.PORT },
        "Application server started.",
    );
}

function application_server_respond_error(response: ServerResponse): void {
    application_logger.error({}, "HTTP request handling failed.");
    if (response.headersSent) {
        response.end(JSON.stringify({ code: "INTERNAL_ERROR" }));
        return;
    }
    response.writeHead(500, {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify({ code: "INTERNAL_ERROR" }));
}

function application_server_create_shutdown(
    server: Server,
    close_application: () => Promise<void>,
): (signal: string) => Promise<void> {
    let shutdown_started = false;

    return async (signal: string): Promise<void> => {
        assert.ok(signal.length > 0);
        assert.ok(signal.length <= 15);

        if (shutdown_started) {
            return;
        }

        shutdown_started = true;
        application_logger.info({ signal }, "Application shutdown started.");
        server.close();
        await stop_job_runtime();
        await close_application();
        process.exitCode = 0;
        application_logger.info({ signal }, "Application shutdown completed.");
    };
}

function application_server_request_shutdown(
    shutdown: (signal: string) => Promise<void>,
    signal: string,
): void {
    assert.ok(signal.length > 0);
    assert.ok(signal.length <= 15);

    shutdown(signal).catch(() => {
        application_logger.fatal({ signal }, "Application shutdown failed.");
        process.exitCode = 1;
    });
}
