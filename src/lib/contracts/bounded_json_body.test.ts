import { afterEach, expect, it, vi } from "vitest";

import { p1_http_body_max_bytes, read_p1_json_body } from "./bounded_json_body.ts";

// Exercise raw byte, framing, encoding, chunk-count, and time bounds rather than trusting headers.
afterEach(() => {
    vi.useRealTimers();
});

it("accepts JSON exactly at the byte limit and rejects one byte beyond it", async () => {
    const body = `"${"x".repeat(p1_http_body_max_bytes - 2)}"`;
    expect(await read_p1_json_body(json_request(body))).toHaveLength(p1_http_body_max_bytes - 2);
    expect(await read_p1_json_body(json_request(`${body} `))).toBeNull();
});

it.each(["", "{", "undefined", "\u0000"])("rejects malformed JSON %#", async (body) => {
    expect(await read_p1_json_body(json_request(body))).toBeNull();
});

it("rejects absent and incorrectly typed bodies", async () => {
    expect(await read_p1_json_body(new Request("http://localhost/test"))).toBeNull();
    expect(
        await read_p1_json_body(
            new Request("http://localhost/test", {
                method: "POST",
                headers: { "content-type": "application/json" },
            }),
        ),
    ).toBeNull();
    expect(
        await read_p1_json_body(
            new Request("http://localhost/test", {
                method: "POST",
                body: "{}",
                headers: { "content-type": "text/plain" },
            }),
        ),
    ).toBeNull();
});

it("rejects invalid UTF-8 instead of substituting replacement characters", async () => {
    expect(await read_p1_json_body(json_request(new Uint8Array([34, 255, 34])))).toBeNull();
});

it("bounds slow streams by time and cancels unread bytes", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn<() => void>();
    const stream = new ReadableStream<Uint8Array>({ cancel });
    const result = read_p1_json_body(stream_request(stream));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await result).toBeNull();
    expect(cancel).toHaveBeenCalledOnce();
});

it("bounds streams of empty chunks and cancels oversize chunked bodies", async () => {
    const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
            controller.enqueue(new Uint8Array(0));
        },
    });
    expect(await read_p1_json_body(stream_request(stream))).toBeNull();
    const oversized = new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(new Uint8Array(p1_http_body_max_bytes + 1));
            controller.close();
        },
    });
    expect(await read_p1_json_body(stream_request(oversized))).toBeNull();
});

function json_request(body: string | Uint8Array<ArrayBuffer>) {
    return new Request("http://localhost/test", {
        method: "POST",
        body,
        headers: { "content-type": "application/json; charset=utf-8" },
    });
}

function stream_request(body: ReadableStream<Uint8Array>) {
    const options = {
        method: "POST",
        body,
        duplex: "half",
        headers: { "content-type": "application/json" },
    };
    return new Request("http://localhost/test", options);
}
