import { describe, expect, it } from "vitest";

import {
    create_p1_workspace_token,
    hash_p1_workspace_token,
    is_p1_workspace_token,
} from "./workspace_token";

describe("workspace token", () => {
    // These tests prove token entropy shape, deterministic hashing, and malformed-token denial.
    it("creates opaque unique tokens and stable hashes", () => {
        const first = create_p1_workspace_token();
        const second = create_p1_workspace_token();

        expect(first.token).toHaveLength(47);
        expect(first.token).not.toBe(second.token);
        expect(first.token_hash).toBe(hash_p1_workspace_token(first.token));
        expect(first.token_hash).not.toContain(first.token);
    });

    it.each([undefined, null, "", "p1w_short", `p1w_${"a".repeat(44)}`, "x".repeat(47)])(
        "rejects malformed token %s",
        (token) => {
            expect(is_p1_workspace_token(token)).toBe(false);
        },
    );
});
