import { expect, it } from "vitest";
import { read_stripe_evidence_key } from "./stripe_configuration.ts";
import { test_key } from "./stripe_test_fixture.ts";

const environment = {
    NODE_ENV: "production",
    PORT: "3000",
    SERVER_HOST: "127.0.0.1",
    APPLICATION_ORIGIN: "http://127.0.0.1:3000",
    DATABASE_SSL: "disable",
    DATABASE_URL: "postgresql://integration_hub:integration_hub@127.0.0.1:5432/integration_hub",
    STRIPE_SECRET_KEY: test_key,
} satisfies NodeJS.ProcessEnv;
const confirmation = "create-and-delete-test-customer";

// Authorize only the confirmed canonical local database; reject query-based host overrides too.
it("admits only the confirmed local configuration", () => {
    expect(read_stripe_evidence_key({ environment, confirmation })).toBe(test_key);
    expect(() => read_stripe_evidence_key({ environment, confirmation: undefined })).toThrow(
        "Invalid maintainer configuration.",
    );
});

it.each([
    { DATABASE_URL: environment.DATABASE_URL + "?host=foreign.example" },
    { DATABASE_URL: environment.DATABASE_URL + "#fragment" },
    { DATABASE_URL: environment.DATABASE_URL.replace("127.0.0.1", "foreign.example") },
    { DATABASE_URL: environment.DATABASE_URL.replace("5432", "5433") },
    { DATABASE_URL: environment.DATABASE_URL.replace(/integration_hub$/u, "other_database") },
    { DATABASE_URL: environment.DATABASE_URL.replace("postgresql:", "https:") },
    { DATABASE_SSL: "verify-full" },
    { NODE_TLS_REJECT_UNAUTHORIZED: "0" },
    { STRIPE_SECRET_KEY: "" },
    { STRIPE_SECRET_KEY: "sk_live_forbidden" },
])("rejects unsafe configuration: %j", (override) => {
    expect(() =>
        read_stripe_evidence_key({ environment: { ...environment, ...override }, confirmation }),
    ).toThrow(/configuration/u);
});
