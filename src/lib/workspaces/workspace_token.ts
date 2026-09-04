import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

export const p1_workspace_cookie_name = "p1_demo_workspace";
export const p1_workspace_token_max_age_seconds = 86_400;
const p1_workspace_token_prefix = "p1w_";
const p1_workspace_token_random_bytes = 32;
const p1_workspace_token_schema = z
    .string()
    .length(47)
    .regex(/^p1w_[A-Za-z0-9_-]{43}$/u);

export function create_p1_workspace_token(): Readonly<{ token: string; token_hash: string }> {
    assert.equal(p1_workspace_token_random_bytes, 32);
    assert.ok(p1_workspace_token_max_age_seconds > 0);

    const token = `${p1_workspace_token_prefix}${randomBytes(
        p1_workspace_token_random_bytes,
    ).toString("base64url")}`;
    const token_hash = hash_p1_workspace_token(token);

    assert.equal(token.length, 47);
    assert.equal(token_hash.length, 64);

    return Object.freeze({ token, token_hash });
}

export function hash_p1_workspace_token(input: string): string {
    const token = p1_workspace_token_schema.parse(input);
    const token_hash = createHash("sha256").update(token, "utf8").digest("hex");

    assert.equal(token_hash.length, 64);
    assert.match(token_hash, /^[a-f0-9]{64}$/u);

    return token_hash;
}

export function is_p1_workspace_token(input: unknown): input is string {
    const result = p1_workspace_token_schema.safeParse(input);

    assert.equal(typeof result.success, "boolean");
    assert.equal(p1_workspace_token_prefix.length, 4);

    return result.success;
}
