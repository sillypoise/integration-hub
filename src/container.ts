import { existsSync } from "node:fs";

// Verify the launch context itself; an administrative shell is not sufficient runtime evidence.
const node_package_tools = [
    "/usr/local/bin/npm",
    "/usr/local/bin/npx",
    "/usr/local/bin/corepack",
    "/usr/local/bin/yarn",
    "/usr/local/bin/yarnpkg",
    "/usr/local/lib/node_modules/npm",
    "/usr/local/lib/node_modules/corepack",
] as const;

const uid_valid = process.getuid?.() === 10001;
const node_tools_available = node_package_tools.some(existsSync);
if (!uid_valid || node_tools_available) {
    process.stderr.write(
        `${JSON.stringify({
            level: "fatal",
            message: "Container runtime verification failed.",
            uid_valid,
            node_tools_available,
        })}\n`,
    );
    process.exitCode = 1;
} else {
    process.stdout.write('{"level":"info","message":"Container runtime verified."}\n');
    await import("./server.ts");
}
