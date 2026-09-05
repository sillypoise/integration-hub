import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const base_url = `http://127.0.0.1:${port}`;

export default defineConfig({
    testDir: "./tests/browser",
    fullyParallel: false,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: [["list"]],
    timeout: 15_000,
    expect: {
        timeout: 5_000,
    },
    use: {
        baseURL: base_url,
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        video: "off",
    },
    projects: [
        {
            name: "chromium-desktop",
            use: { ...devices["Desktop Chrome"] },
        },
    ],
    webServer: {
        // The custom production entry point starts the worker as well as the HTTP server.
        command: "pnpm start",
        env: {
            APPLICATION_ORIGIN: base_url,
            DATABASE_SSL: "disable",
            DATABASE_URL:
                "postgresql://integration_hub:integration_hub@127.0.0.1:5432/integration_hub",
            NODE_ENV: "production",
            PORT: String(port),
            SERVER_HOST: "127.0.0.1",
        },
        reuseExistingServer: false,
        timeout: 60_000,
        url: base_url,
    },
});
