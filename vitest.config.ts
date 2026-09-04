import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
        fileParallelism: false,
        globals: false,
        include: ["src/**/*.test.ts"],
        passWithNoTests: false,
        testTimeout: 5_000,
        hookTimeout: 5_000,
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"],
            include: ["src/**/*.ts"],
            // Runtime wiring is verified by PostgreSQL and browser integration tests.
            exclude: [
                "src/**/*.test.ts",
                "src/app/**",
                "src/db/schema.ts",
                "src/lib/database/**",
                "src/lib/jobs/job_runtime.ts",
                "src/lib/observability/**",
                "src/scripts/**",
                "src/server.ts",
                "src/server/**",
            ],
            thresholds: {
                branches: 90,
                functions: 90,
                lines: 90,
                statements: 90,
            },
        },
    },
});
