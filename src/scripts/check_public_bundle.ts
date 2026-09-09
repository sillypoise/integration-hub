import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

// Scan bounded public artifacts only, without printing matched bytes or secret values.
async function check_public_bundle(): Promise<void> {
    const entries = await readdir(".next/static", { recursive: true, withFileTypes: true });
    assert.ok(entries.length <= 10_000);
    const forbidden = [
        "p1_token_hash",
        "postgresql://",
        "STRIPE_SECRET_KEY",
        "api.stripe.com",
        "p1_stripe_probe",
        "HUBSPOT_ACCESS_TOKEN",
    ];
    const files = entries.filter((entry) => entry.isFile());
    assert.ok(files.length > 0);
    let total_bytes = 0;
    for (const entry of files) {
        assert.equal(entry.name.endsWith(".map"), false, "Public source maps are not admitted.");
        if (entry.name.endsWith(".js")) {
            const path = join(entry.parentPath, entry.name);
            // Sequential artifact inspection keeps memory independent of bundle chunk count.
            // oxlint-disable-next-line no-await-in-loop
            const metadata = await stat(path);
            total_bytes += metadata.size;
            assert.ok(total_bytes <= 32 * 1_024 * 1_024);
            // oxlint-disable-next-line no-await-in-loop
            const source = await readFile(path, { encoding: "utf8" });
            assert.equal(
                forbidden.some((marker) => source.includes(marker)),
                false,
                "Server-only material reached a public bundle.",
            );
        }
    }
    process.stdout.write(
        JSON.stringify({ public_bundle_check: "passed", bytes_checked: total_bytes }) + "\n",
    );
}

check_public_bundle().catch(() => {
    process.stderr.write("Public bundle security check failed.\n");
    process.exitCode = 1;
});
