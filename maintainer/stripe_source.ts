import { createHash } from "node:crypto";
import { z } from "zod";
import { read_p1_json_body } from "../src/lib/contracts/bounded_json_body.ts";
import { p1_source_customer_event_schema } from "../src/lib/contracts/synchronization_contracts.ts";

const stripe_origin = "https://api.stripe.com";
export const stripe_version = "2026-08-26.dahlia";
export const stripe_account_id = z.string().regex(/^acct_[A-Za-z0-9]{1,50}$/u);
export const stripe_account_schema = z
    .object({ id: stripe_account_id, object: z.literal("account") })
    .strip();
export const stripe_customer_id = z.string().regex(/^cus_[A-Za-z0-9]{1,50}$/u);
export const stripe_probe = z
    .object({
        operation_id: z.uuid(),
        started_at: z.iso.datetime(),
    })
    .strict();
export type StripeProbe = z.infer<typeof stripe_probe>;
export type StripeFailure = Readonly<{
    ok: false;
    code:
        | "INVALID_INPUT"
        | "DEPENDENCY_UNAVAILABLE"
        | "REQUEST_LIMIT_REACHED"
        | "RESOURCE_NOT_FOUND";
    reason:
        | "configuration"
        | "authentication"
        | "transport"
        | "provider"
        | "rate_limit"
        | "invalid_response"
        | "not_found";
}>;
export type StripeResult = Readonly<{ ok: true; body: unknown }> | StripeFailure;

export function valid_stripe_test_key(key: string): boolean {
    return /^sk_test_[A-Za-z0-9]{8,240}$/u.test(key);
}

// Only these three fixed-origin operations are admitted; no endpoint or live-mode override.
export async function request_stripe_fixture(
    options: Readonly<{
        key: string;
        probe: StripeProbe;
        operation: "create" | "read" | "delete";
        customer_id?: string;
    }>,
    transport: typeof fetch = fetch,
): Promise<StripeResult> {
    if (!valid_stripe_test_key(options.key) || !stripe_probe.safeParse(options.probe).success) {
        return { ok: false, code: "INVALID_INPUT", reason: "configuration" };
    }
    if (!["create", "read", "delete"].includes(options.operation)) {
        return { ok: false, code: "INVALID_INPUT", reason: "configuration" };
    }
    const creating = options.operation === "create";
    if (!creating && !stripe_customer_id.safeParse(options.customer_id).success) {
        return { ok: false, code: "INVALID_INPUT", reason: "configuration" };
    }
    const headers = new Headers({
        Authorization: `Bearer ${options.key}`,
        "Stripe-Version": stripe_version,
    });
    const body = new URLSearchParams({
        name: "Portfolio Fixture",
        email: "stripe-fixture@example.test",
        "metadata[p1_stripe_probe]": options.probe.operation_id,
        "metadata[p1_updated_at]": options.probe.started_at,
    });
    if (creating) {
        headers.set("Idempotency-Key", `p1-stripe-${options.probe.operation_id}`);
        headers.set("Content-Type", "application/x-www-form-urlencoded");
    }
    return stripe_fetch(
        {
            url: `${stripe_origin}/v1/customers${creating ? "" : `/${options.customer_id ?? ""}`}`,
            init: {
                method: creating ? "POST" : options.operation === "read" ? "GET" : "DELETE",
                headers,
                ...(creating ? { body } : {}),
            },
        },
        transport,
    );
}

export async function request_stripe_account(
    key: string,
    transport: typeof fetch = fetch,
): Promise<StripeResult> {
    if (!valid_stripe_test_key(key)) {
        return { ok: false as const, code: "INVALID_INPUT", reason: "configuration" };
    }
    return stripe_fetch(
        {
            url: `${stripe_origin}/v1/account`,
            init: {
                method: "GET",
                headers: { Authorization: `Bearer ${key}`, "Stripe-Version": stripe_version },
            },
        },
        transport,
    );
}

async function stripe_fetch(
    options: Readonly<{ url: string; init: RequestInit }>,
    transport: typeof fetch,
): Promise<StripeResult> {
    try {
        const response = await transport(options.url, {
            ...options.init,
            redirect: "error",
            cache: "no-store",
            signal: AbortSignal.timeout(8_000),
        });
        const request_id = response.headers.get("request-id");
        process.stdout.write(
            JSON.stringify({
                stripe_request: options.init.method,
                status: response.status,
                request_id: /^req_[A-Za-z0-9]{1,64}$/u.test(request_id ?? "") ? request_id : null,
            }) + "\n",
        );
        if (response.status !== 200) {
            await response.body?.cancel();
            return classify_stripe_failure(response.status);
        }
        const parsed: unknown = await read_p1_json_body(response);
        if (parsed === null) {
            return { ok: false, code: "INVALID_INPUT", reason: "invalid_response" };
        }
        return { ok: true, body: parsed };
    } catch {
        // Timeout is not rollback. The journal retains the key for reconciliation.
        process.stderr.write('{"stripe_request":"failed","reason":"transport"}\n');
        return { ok: false, code: "DEPENDENCY_UNAVAILABLE", reason: "transport" };
    }
}

export function parse_stripe_fixture(input: unknown, probe: StripeProbe, expected_id?: string) {
    const schema = z
        .object({
            id: stripe_customer_id,
            object: z.literal("customer"),
            livemode: z.literal(false),
            name: z.literal("Portfolio Fixture"),
            email: z.literal("stripe-fixture@example.test"),
            metadata: z
                .object({
                    p1_stripe_probe: z.literal(probe.operation_id),
                    p1_updated_at: z.literal(probe.started_at),
                })
                .strip(),
        })
        .strip();
    const result = schema.safeParse(input);
    if (!result.success) return null;
    if (expected_id !== undefined && result.data.id !== expected_id) return null;
    const customer = result.data;
    const event = p1_source_customer_event_schema.safeParse({
        p1_event_type: "commerce.customer.updated",
        p1_idempotency_key: createHash("sha256")
            .update(`stripe:${customer.id}:${probe.operation_id}`)
            .digest("hex"),
        p1_customer: {
            p1_external_id: customer.id,
            p1_email: customer.email,
            p1_first_name: customer.name.split(" ")[0],
            p1_last_name: customer.name.split(" ")[1],
            p1_updated_at: customer.metadata.p1_updated_at,
        },
    });
    return event.success ? event.data : null;
}

export function stripe_fixture_deleted(input: unknown, customer_id: string): boolean {
    return z
        .object({
            id: z.literal(customer_id),
            object: z.literal("customer"),
            deleted: z.literal(true),
        })
        .strip()
        .safeParse(input).success;
}

function classify_stripe_failure(status: number): StripeFailure {
    if (status === 401 || status === 403) {
        return { ok: false, code: "DEPENDENCY_UNAVAILABLE", reason: "authentication" };
    }
    if (status === 429) return { ok: false, code: "REQUEST_LIMIT_REACHED", reason: "rate_limit" };
    if (status === 404) return { ok: false, code: "RESOURCE_NOT_FOUND", reason: "not_found" };
    return { ok: false, code: "DEPENDENCY_UNAVAILABLE", reason: "provider" };
}
