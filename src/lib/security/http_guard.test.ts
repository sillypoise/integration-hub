import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { afterEach, expect, it, vi } from "vitest";
import { application_logger } from "../observability/application_logger.ts";
import { create_p1_http_guard } from "./http_guard.ts";

const options = { production: true, https: true };
afterEach(() => {
    vi.restoreAllMocks();
});

// Real Node request/response objects exercise the guard without untrusted IP identity or a database.
it.each([
    ["GET", "/demo", 1_200],
    ["POST", "/api/demo/events", 120],
    ["POST", "/api/demo/workspaces", 20],
    ["GET", "/health/ready", 120],
] as const)("bounds %s %s at %i and recovers exactly at the next minute", (method, url, limit) => {
    let time = 59_999;
    const guard = create_p1_http_guard(options, () => time);
    const log = vi.spyOn(application_logger, "warn").mockImplementation(() => undefined);
    for (let index = 0; index < limit; index += 1) {
        const request = message(method, url);
        const release = guard(request, new ServerResponse(request));
        expect(release).not.toBeNull();
        release?.();
    }
    const rejected = message(method, url);
    rejected.headers["x-forwarded-for"] = "203.0.113.8";
    const response = new ServerResponse(rejected);
    expect(guard(rejected, response)).toBeNull();
    expect(response.statusCode).toBe(429);
    expect(response.getHeader("retry-after")).toBe("60");
    expect(guard(rejected, new ServerResponse(rejected))).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
    time = 60_000;
    const release = guard(rejected, new ServerResponse(rejected));
    expect(release).not.toBeNull();
    release?.();
});
it("keeps health capacity separate and releases each handler slot at most once", () => {
    const guard = create_p1_http_guard(options, () => 0);
    const releases = Array.from({ length: 16 }, () => {
        const request = message("GET", "/demo");
        return guard(request, new ServerResponse(request));
    });
    const extra = message("GET", "/api/demo/runs");
    const response = new ServerResponse(extra);
    expect(guard(extra, response)).toBeNull();
    expect(response.statusCode).toBe(503);
    const health = message("HEAD", "/health/live");
    const first = guard(health, new ServerResponse(health));
    const second = guard(health, new ServerResponse(health));
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(guard(health, new ServerResponse(health))).toBeNull();
    first?.();
    first?.();
    second?.();
    for (const release of releases) {
        release?.();
        release?.();
    }
    expect(guard(extra, new ServerResponse(extra))).not.toBeNull();
});
it("replaces forged CSP/nonces, varies nonces, and does not weaken production script execution", () => {
    const guard = create_p1_http_guard(options, () => 0);
    const request = message("GET", "/");
    request.headers["content-security-policy"] = "script-src * 'unsafe-inline'";
    request.headers["x-nonce"] = "attacker";
    const first = new ServerResponse(request);
    guard(request, first)?.();
    const second = new ServerResponse(request);
    guard(request, second)?.();
    expect(first.getHeader("content-security-policy")).not.toBe(
        second.getHeader("content-security-policy"),
    );
    expect(request.headers["x-nonce"]).toBeUndefined();
    const policy = String(first.getHeader("content-security-policy"));
    expect(policy).toMatch(/script-src 'nonce-[A-Za-z0-9+/]{43}=' 'strict-dynamic'/u);
    expect(policy).not.toContain("unsafe-eval");
    expect(policy).not.toContain("attacker");
    expect(first.getHeader("strict-transport-security")).toBe("max-age=31536000");
    expect(first.getHeader("referrer-policy")).toBe("no-referrer");
    expect(first.getHeader("x-frame-options")).toBe("DENY");
});
it("allows local development tooling without setting HSTS for HTTP", () => {
    const guard = create_p1_http_guard({ production: false, https: false }, () => 0);
    const request = message("GET", "/");
    const response = new ServerResponse(request);
    guard(request, response)?.();
    expect(response.getHeader("strict-transport-security")).toBeUndefined();
    expect(response.getHeader("content-security-policy")).toContain("unsafe-eval");
    expect(response.getHeader("content-security-policy")).toContain("ws:");
});
it("rejects oversized and malformed paths; encoded/trailing creation paths share the budget", () => {
    const guard = create_p1_http_guard(options, () => 0);
    const oversized = message("GET", "/".repeat(2_049));
    const response = new ServerResponse(oversized);
    expect(guard(oversized, response)).toBeNull();
    expect(response.statusCode).toBe(414);
    const malformed = message("GET", "/%zz");
    expect(guard(malformed, new ServerResponse(malformed))).toBeNull();
    for (let index = 0; index < 20; index += 1) {
        const request = message("POST", "/api/demo/%77orkspaces/?x=1");
        guard(request, new ServerResponse(request))?.();
    }
    const request = message("POST", "/api/demo/workspaces");
    expect(guard(request, new ServerResponse(request))).toBeNull();
    const boundary = message("GET", "/".repeat(2_048));
    expect(guard(boundary, new ServerResponse(boundary))).not.toBeNull();
});
function message(method: string, url: string) {
    const request = new IncomingMessage(new Socket());
    request.method = method;
    request.url = url;
    return request;
}
