import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { application_logger } from "../observability/application_logger.ts";

export function create_p1_http_guard(
    options: Readonly<{ production: boolean; https: boolean }>,
    clock_ms: () => number,
) {
    // Four fixed counters: no visitor/IP map, unbounded queue, or forwarded-header authority.
    const windows: [number, number, number, number] = [0, 0, 0, 0];
    const counts: [number, number, number, number] = [0, 0, 0, 0];
    const limits: [number, number, number, number] = [1_200, 120, 20, 120];
    let active = 0;
    let active_health = 0;
    let logged_window = -1;
    function deny(response: ServerResponse, status: number, code: string): null {
        const window = Math.floor(clock_ms() / 60_000);
        if (logged_window !== window) {
            logged_window = window;
            application_logger.warn(
                { code },
                "HTTP admission denied; repeats sampled for one minute.",
            );
        }
        return reject_p1_http_request(response, status, code);
    }
    return (request: IncomingMessage, response: ServerResponse): (() => void) | null => {
        apply_p1_security_headers(request, response, options);
        const url = request.url ?? "";
        if (url.length > 2_048) return deny(response, 414, "INVALID_INPUT");
        let indices: ReadonlyArray<0 | 1 | 2 | 3>;
        try {
            indices = create_p1_http_guard_buckets(url, request.method);
        } catch {
            return deny(response, 400, "INVALID_INPUT");
        }
        const health = indices[0] === 3;
        const window = Math.floor(clock_ms() / 60_000);
        assert.ok(Number.isSafeInteger(window));
        for (const index of indices) {
            if (windows[index] !== window) {
                windows[index] = window;
                counts[index] = 0;
            }
            assert.ok(index <= 3);
            if (counts[index] >= limits[index]) {
                return deny(response, 429, "REQUEST_LIMIT_REACHED");
            }
        }
        if (health ? active_health >= 2 : active >= 16) {
            return deny(response, 503, "DEPENDENCY_UNAVAILABLE");
        }
        for (const index of indices) counts[index] += 1;
        if (health) active_health += 1;
        else active += 1;
        let released = false;
        return () => {
            if (released) return;
            released = true;
            if (health) active_health -= 1;
            else active -= 1;
            assert.ok(active >= 0);
            assert.ok(active_health >= 0);
        };
    };
}

function create_p1_http_guard_buckets(
    url: string,
    method: string | undefined,
): ReadonlyArray<0 | 1 | 2 | 3> {
    assert.ok(url.length <= 2_048);
    const path = decodeURIComponent(url.split("?")[0] ?? "").replace(/\/+$/u, "");
    if (url === "/health/live" || url === "/health/ready") return [3];
    if (method === "GET" || method === "HEAD") return [0];
    if (path === "/api/demo/workspaces") return [0, 1, 2];
    return [0, 1];
}

export function apply_p1_security_headers(
    request: IncomingMessage,
    response: ServerResponse,
    options: Readonly<{ production: boolean; https: boolean }>,
): void {
    const nonce = randomBytes(32).toString("base64");
    assert.equal(nonce.length, 44);
    const policy = [
        "default-src 'none'",
        `script-src 'nonce-${nonce}' 'strict-dynamic'${options.production ? "" : " 'unsafe-eval'"}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self'",
        `connect-src 'self'${options.production ? "" : " ws:"}`,
        "object-src 'none'",
        "base-uri 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
    ].join("; ");
    // Next reads this trusted request header to nonce its framework and hydration scripts.
    request.headers["content-security-policy"] = policy;
    delete request.headers["x-nonce"];
    response.setHeader("content-security-policy", policy);
    response.setHeader("x-content-type-options", "nosniff");
    response.setHeader("x-frame-options", "DENY");
    response.setHeader("referrer-policy", "no-referrer");
    response.setHeader(
        "permissions-policy",
        "camera=(), microphone=(), geolocation=(), payment=()",
    );
    response.setHeader("cross-origin-opener-policy", "same-origin");
    response.setHeader("cross-origin-resource-policy", "same-origin");
    response.setHeader("cache-control", "no-store");
    if (options.https) response.setHeader("strict-transport-security", "max-age=31536000");
    assert.equal(response.getHeader("x-frame-options"), "DENY");
}

function reject_p1_http_request(response: ServerResponse, status: number, code: string): null {
    assert.ok(status >= 400);
    assert.ok(status <= 599);
    response.writeHead(status, {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
        "retry-after": "60",
        connection: "close",
    });
    response.end(JSON.stringify({ code }));
    return null;
}
