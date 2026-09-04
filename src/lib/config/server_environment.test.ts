import { describe, expect, it } from "vitest";

import { read_server_environment } from "./server_environment";

const valid_environment = Object.freeze({
    APPLICATION_ORIGIN: "http://127.0.0.1:3000",
    DATABASE_SSL: "disable",
    DATABASE_URL: "postgresql://user:password@localhost:5432/integration_hub",
    NODE_ENV: "test",
    PORT: "3000",
    SERVER_HOST: "127.0.0.1",
});

describe("read_server_environment", () => {
    // These tests prove valid parsing and verify that invalid secret values never enter errors.
    it("accepts the complete server configuration", () => {
        const environment = read_server_environment(valid_environment);

        expect(environment.NODE_ENV).toBe("test");
        expect(environment.PORT).toBe(3_000);
        expect(Object.isFrozen(environment)).toBe(true);
    });

    it("rejects an application origin containing a path", () => {
        const environment = {
            ...valid_environment,
            APPLICATION_ORIGIN: "https://example.test/not-an-origin",
        };

        expect(() => read_server_environment(environment)).toThrow(
            "Invalid server environment configuration.",
        );
    });

    it("rejects missing required configuration", () => {
        const environment = { ...valid_environment, DATABASE_URL: undefined };

        expect(() => read_server_environment(environment)).toThrow(
            "Invalid server environment configuration.",
        );
    });

    it("rejects non-PostgreSQL URLs without leaking their value", () => {
        const secret_value = "https://user:secret@example.com/database";
        const environment = { ...valid_environment, DATABASE_URL: secret_value };

        expect(() => read_server_environment(environment)).toThrow(
            "Invalid server environment configuration.",
        );

        let caught_error: unknown = null;

        try {
            read_server_environment(environment);
        } catch (error: unknown) {
            caught_error = error;
        }

        expect(String(caught_error)).not.toContain(secret_value);
        expect(String(caught_error)).not.toContain("secret");
    });

    it.each(["0", "1023", "65536", "not-a-number"])("rejects invalid port %s", (port) => {
        const environment = { ...valid_environment, PORT: port };

        expect(() => read_server_environment(environment)).toThrow(
            "Invalid server environment configuration.",
        );
    });
});
