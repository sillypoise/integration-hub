import { existsSync } from "node:fs";

// Verify the launch context itself; an administrative shell is not sufficient runtime evidence.
const package_tools = [
    "/usr/local/bin/npm",
    "/usr/local/bin/npx",
    "/usr/local/bin/corepack",
    "/usr/local/bin/yarn",
    "/usr/local/bin/yarnpkg",
    "/usr/local/lib/node_modules/npm",
    "/usr/local/lib/node_modules/corepack",
] as const;

if (process.getuid?.() !== 10001 || package_tools.some(existsSync)) {
    process.stderr.write('{"level":"fatal","message":"Container runtime verification failed."}\n');
    process.exitCode = 1;
} else {
    process.stdout.write('{"level":"info","message":"Container runtime verified."}\n');
    await import("./server.ts");
}
