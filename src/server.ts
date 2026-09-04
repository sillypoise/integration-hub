import { existsSync } from "node:fs";

if (existsSync(".env.local")) {
    process.loadEnvFile(".env.local");
}

try {
    const { run_application_server } = await import("./server/application_server.ts");
    await run_application_server();
} catch {
    // Startup errors stay generic because configuration and provider failures may contain secrets.
    process.stderr.write('{"level":"fatal","message":"Application startup failed."}\n');
    process.exitCode = 1;
}
