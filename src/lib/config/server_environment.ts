import assert from "node:assert/strict";
import { z } from "zod";

const server_environment_schema = z.object({
    DATABASE_URL: z.url().startsWith("postgresql://"),
    NODE_ENV: z.enum(["development", "test", "production"]),
});

export type ServerEnvironment = Readonly<z.infer<typeof server_environment_schema>>;

export function read_server_environment(
    input: Readonly<Record<string, string | undefined>>,
): ServerEnvironment {
    assert.equal(typeof input, "object");
    assert.equal(Array.isArray(input), false);

    const parsed_environment = server_environment_schema.safeParse(input);

    if (parsed_environment.success) {
        assert.ok(parsed_environment.data.DATABASE_URL.length > 0);
        assert.ok(parsed_environment.data.NODE_ENV.length > 0);

        return Object.freeze(parsed_environment.data);
    }

    // Configuration details can contain secrets, so startup errors stay intentionally generic.
    throw new Error("Invalid server environment configuration.");
}
