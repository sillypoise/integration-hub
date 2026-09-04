# Stage 3 Report: Contracts, Schema, and Workspace Isolation

## Status

Complete. The application now has explicit synchronization contracts, database-enforced ownership
boundaries, and an isolated public workspace credential.

## Delivered

- Defined strict source event, mapped customer, identifier-only job, state, and safe-error contracts
  in [`../contracts.md`](../contracts.md).
- Added forward-only domain migrations for workspaces, source events, synchronization runs,
  attempts, and audit events.
- Prefixed every project-owned table and column and every explicitly named index and constraint with
  `p1_`.
- Enforced source-event immutability, 16 KiB stored payloads, three attempts, one logical run per
  source event, and workspace-consistent foreign keys in PostgreSQL.
- Added compare-and-set run transitions and workspace-scoped reads.
- Added 256-bit opaque workspace tokens, SHA-256 token storage, 24-hour expiry, and an HTTP-only,
  SameSite Strict, host-only cookie.
- Added exact-origin validation before workspace creation and stable safe HTTP errors.
- Bounded active workspaces at 500, retained events at 1,000 per workspace, and cleanup at 100
  expired workspaces per hourly job.

## Verified

- Migrations apply repeatedly and CI applies them against an empty PostgreSQL 17 database.
- Contract tests accept the exact supported shape and reject unknown, malformed, oversized, and raw
  customer job fields.
- Duplicate source delivery returns the same source event and run, with one accepted-event audit.
- Valid run transitions succeed; stale, invalid, terminal, cross-workspace, and retryable-failure
  transitions at exhaustion have no effect.
- Missing, malformed, unknown, expired, and cross-workspace credentials are denied.
- Database constraints reject oversized payloads and cross-workspace relationships.
- The source-event update trigger rejects mutation after acceptance.
- Cleanup respects its batch boundary and preserves active and unselected workspaces.
- Browser-server coverage verifies origin denial, opaque cookie issuance, and authenticated
  workspace lookup.
- GitHub Actions run
  [`33928030317`](https://github.com/sillypoise/integration-hub/actions/runs/33928030317) passed the
  empty-database migration, 44 tests, coverage thresholds, browser checks, and production-container
  smoke test.
- Railway deployment `43db3146-da4d-4385-8302-261b7689a84c` passed its migration and readiness gate.
- Hosted boundary probes returned `401` without a cookie, `403` for a foreign origin, `201` for
  issuance, and `200` for subsequent cookie authentication. The issued cookie had HTTP-only, Secure,
  and SameSite Strict attributes.
- Hosted inspection found five `p1_` domain tables, no unprefixed project columns, three applied
  migrations, one cleanup schedule, and 64-character stored token hashes.

## Contract delta

This is the first domain contract and schema, so compatibility is additive with no existing domain
consumer to migrate. Ownership is the repository maintainer. Future breaking field, state, error, or
retention changes require a documented replacement and controlled cutover.

## Deferred intentionally

Stage 4 will expose event intake and connect these persistence contracts to the simulator and
worker. Stage 5 will turn workspace creation into the public demo-entry experience.
