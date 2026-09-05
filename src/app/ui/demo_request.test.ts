import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { demo_request } from "./demo_request.ts";

afterEach(() => {
    vi.unstubAllGlobals();
});

// Never expose server error bodies; validation must also reject incompatible successful responses.
it.each([
    [401, "unauthorized"],
    [404, "not_found"],
    [400, "invalid"],
    [409, "limit"],
    [503, "unavailable"],
] as const)("maps HTTP %s safely", async (status, error) => {
    vi.stubGlobal(
        "fetch",
        vi.fn<typeof fetch>().mockResolvedValue(new Response("secret", { status })),
    );
    expect(
        await demo_request({ path: "/api/demo/overview", method: "GET", schema: z.object({}) }),
    ).toEqual({ ok: false, error });
});
it("validates successful JSON and sends only same-origin cookie authority", async () => {
    const fetch_mock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ value: 1 }));
    vi.stubGlobal("fetch", fetch_mock);
    const result = await demo_request({
        path: "/api/demo/events",
        method: "POST",
        schema: z.object({ value: z.number() }),
        body: { p1_customer_number: 1 },
    });
    expect(result).toEqual({ ok: true, data: { value: 1 } });
    expect(fetch_mock).toHaveBeenCalledWith(
        "/api/demo/events",
        expect.objectContaining({
            credentials: "same-origin",
            redirect: "error",
            cache: "no-store",
            headers: { "content-type": "application/json" },
        }),
    );
});
it("handles transport failures and malformed data without rendering raw details", async () => {
    const fetch_mock = vi
        .fn<typeof fetch>()
        .mockRejectedValueOnce(new Error("private detail"))
        .mockResolvedValueOnce(new Response("not-json"))
        .mockResolvedValueOnce(Response.json({ unexpected: "do-not-render" }));
    vi.stubGlobal("fetch", fetch_mock);
    const options = {
        path: "/api/demo/events",
        method: "GET" as const,
        schema: z.object({ value: z.number() }),
        signal: new AbortController().signal,
    };
    expect(await demo_request(options)).toEqual({ ok: false, error: "unavailable" });
    expect(await demo_request(options)).toEqual({ ok: false, error: "unavailable" });
    expect(await demo_request(options)).toEqual({ ok: false, error: "unavailable" });
});
