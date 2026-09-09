import { read_server_environment } from "../src/lib/config/server_environment.ts";
import { valid_stripe_test_key } from "./stripe_source.ts";

// Validate all local configuration before any provider call. URL query parameters can override
// PostgreSQL connection fields, so a loopback hostname alone is insufficient authorization.
export function read_stripe_evidence_key(
    options: Readonly<{
        environment: NodeJS.ProcessEnv;
        confirmation: string | undefined;
    }>,
): string {
    const environment = read_server_environment(options.environment);
    const database = new URL(environment.DATABASE_URL);
    const key = options.environment.STRIPE_SECRET_KEY ?? "";
    if (
        options.confirmation !== "create-and-delete-test-customer" ||
        !valid_stripe_test_key(key) ||
        options.environment.NODE_TLS_REJECT_UNAUTHORIZED === "0" ||
        database.protocol !== "postgresql:" ||
        database.hostname !== "127.0.0.1" ||
        database.port !== "5432" ||
        database.pathname !== "/integration_hub" ||
        database.search !== "" ||
        database.hash !== "" ||
        environment.DATABASE_SSL !== "disable"
    ) {
        throw new Error("Invalid maintainer configuration.");
    }
    return key;
}
