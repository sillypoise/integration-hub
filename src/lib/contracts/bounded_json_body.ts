import assert from "node:assert/strict";
import { application_logger } from "../observability/application_logger.ts";

export const p1_http_body_max_bytes = 16_384;

export async function read_p1_json_body(request: Request): Promise<unknown> {
    assert.ok(p1_http_body_max_bytes > 0);
    assert.ok(request.url.length > 0);
    if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") {
        return null;
    }
    if (request.body === null) return null;
    const reader = request.body.getReader();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            read_p1_json_body_stream(reader),
            new Promise<null>((resolve) => {
                timeout = setTimeout(() => {
                    resolve(null);
                }, 5_000);
            }),
        ]);
    } catch {
        return null;
    } finally {
        clearTimeout(timeout);
        // Cancel unread bytes on size or time rejection; cancellation errors are invalid input too.
        void reader.cancel().catch(() => {
            application_logger.warn({}, "Rejected request body cancellation failed.");
        });
    }
}

async function read_p1_json_body_stream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<unknown> {
    const buffer = new Uint8Array(p1_http_body_max_bytes);
    let length_bytes = 0;
    assert.equal(buffer.byteLength, p1_http_body_max_bytes);
    // Bound even zero-length chunk streams; the outer deadline bounds slow streams.
    for (let chunk_count = 0; chunk_count <= p1_http_body_max_bytes; chunk_count += 1) {
        // Sequential reads enforce the byte bound without buffering the entire untrusted stream.
        // oxlint-disable-next-line no-await-in-loop
        const chunk = await reader.read();
        if (chunk.done) {
            assert.ok(length_bytes <= p1_http_body_max_bytes);
            return JSON.parse(
                new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, length_bytes)),
            ) as unknown;
        }
        if (length_bytes + chunk.value.byteLength > p1_http_body_max_bytes) return null;
        buffer.set(chunk.value, length_bytes);
        length_bytes += chunk.value.byteLength;
    }
    return null;
}
