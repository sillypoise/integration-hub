import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        environment: "node",
        globals: false,
        include: ["src/**/*.test.ts"],
        passWithNoTests: false,
        testTimeout: 5_000,
        hookTimeout: 5_000,
        coverage: {
            provider: "v8",
            reporter: ["text", "json", "html"],
            include: ["src/**/*.ts"],
            exclude: ["src/**/*.test.ts", "src/app/**", "src/db/schema.ts"],
            thresholds: {
                branches: 90,
                functions: 90,
                lines: 90,
                statements: 90,
            },
        },
    },
});
