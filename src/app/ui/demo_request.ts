import type { z } from "zod";

export type DemoError =
    | "unauthorized"
    | "not_found"
    | "invalid"
    | "limit"
    | "unavailable"
    | "retry_denied"
    | "reset_limit";
export type DemoResult<Value> = { ok: true; data: Value } | { ok: false; error: DemoError };

export async function demo_request<Value>(options: {
    path: string;
    schema: z.ZodType<Value>;
    method: "GET" | "POST";
    body?: unknown;
    signal?: AbortSignal;
}): Promise<DemoResult<Value>> {
    try {
        const timeout = AbortSignal.timeout(5_000);
        const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
        const response = await fetch(options.path, {
            method: options.method,
            cache: "no-store",
            credentials: "same-origin",
            redirect: "error",
            signal,
            headers: options.body === undefined ? {} : { "content-type": "application/json" },
            ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        });
        if (response.status === 401) return { ok: false, error: "unauthorized" };
        if (response.status === 404) return { ok: false, error: "not_found" };
        if (response.status === 400) return { ok: false, error: "invalid" };
        if (response.status === 409) return { ok: false, error: "limit" };
        if (!response.ok) return { ok: false, error: "unavailable" };
        const parsed = options.schema.safeParse(await response.json());
        if (!parsed.success) return { ok: false, error: "unavailable" };
        return { ok: true, data: parsed.data };
    } catch {
        return { ok: false, error: "unavailable" };
    }
}
