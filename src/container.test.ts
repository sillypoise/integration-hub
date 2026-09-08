import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    exists: vi.fn<(path: string) => boolean>(),
    start: vi.fn<() => void>(),
    stdout: vi.fn<typeof process.stdout.write>(),
    stderr: vi.fn<typeof process.stderr.write>(),
}));
vi.mock("node:fs", () => ({ existsSync: mocks.exists }));
vi.mock("./server.ts", () => {
    mocks.start();
    return {};
});

let exit_code_before_test: typeof process.exitCode;
beforeEach(() => {
    exit_code_before_test = process.exitCode;
    vi.resetModules();
    vi.clearAllMocks();
    mocks.exists.mockReturnValue(false);
    vi.spyOn(process, "getuid").mockReturnValue(10001);
    mocks.stdout.mockReturnValue(true);
    mocks.stderr.mockReturnValue(true);
    vi.spyOn(process.stdout, "write").mockImplementation(mocks.stdout);
    vi.spyOn(process.stderr, "write").mockImplementation(mocks.stderr);
    process.exitCode = undefined;
});

afterEach(() => {
    process.exitCode = exit_code_before_test;
    vi.restoreAllMocks();
});

// Reject privilege overrides and each forbidden package-tool path before importing the server.
it.each([0, 10000, 10002])("denies unexpected container UID %s", async (uid) => {
    vi.spyOn(process, "getuid").mockReturnValue(uid);
    await import("./container.ts");
    expect(process.exitCode).toBe(1);
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.stderr).toHaveBeenCalledWith(
        '{"level":"fatal","message":"Container runtime verification failed."}\n',
    );
});

it.each([
    "/usr/local/bin/npm",
    "/usr/local/bin/npx",
    "/usr/local/bin/corepack",
    "/usr/local/bin/yarn",
    "/usr/local/bin/yarnpkg",
    "/usr/local/lib/node_modules/npm",
    "/usr/local/lib/node_modules/corepack",
])("denies an available package tool at %s", async (path) => {
    mocks.exists.mockImplementation((candidate: string) => candidate === path);
    await import("./container.ts");
    expect(process.exitCode).toBe(1);
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.stdout).not.toHaveBeenCalled();
});

it("starts only after verifying the intended runtime boundary", async () => {
    await import("./container.ts");
    expect(process.exitCode).toBeUndefined();
    expect(mocks.start).toHaveBeenCalledOnce();
    expect(mocks.stderr).not.toHaveBeenCalled();
    expect(mocks.stdout).toHaveBeenCalledWith(
        '{"level":"info","message":"Container runtime verified."}\n',
    );
});
