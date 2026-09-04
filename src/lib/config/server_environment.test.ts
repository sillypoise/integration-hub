import { describe, expect, it } from "vitest";

import { read_server_environment } from "./server_environment";

describe("read_server_environment", () => {
    // These tests prove valid parsing and verify that invalid secret values never enter errors.
    it("accepts the complete server configuration", () => {
        const environment = read_server_environment({
            DATABASE_URL: "postgresql://user:password@localhost:5432/integration_hub",
            NODE_ENV: "test",
        });

        expect(environment.NODE_ENV).toBe("test");
        expect(Object.isFrozen(environment)).toBe(true);
    });

    it("rejects missing required configuration", () => {
        expect(() => read_server_environment({ NODE_ENV: "test" })).toThrow(
            "Invalid server environment configuration.",
        );
    });

    it("rejects non-PostgreSQL URLs without leaking their value", () => {
        const secret_value = "https://user:secret@example.com/database";

        expect(() =>
            read_server_environment({ DATABASE_URL: secret_value, NODE_ENV: "test" }),
        ).toThrow("Invalid server environment configuration.");

        let caught_error: unknown = null;

        try {
            read_server_environment({ DATABASE_URL: secret_value, NODE_ENV: "test" });
        } catch (error: unknown) {
            caught_error = error;
        }

        expect(String(caught_error)).not.toContain(secret_value);
        expect(String(caught_error)).not.toContain("secret");
    });
});
