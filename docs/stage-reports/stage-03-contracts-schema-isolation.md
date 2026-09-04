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

## Contract delta

This is the first domain contract and schema, so compatibility is additive with no existing domain
consumer to migrate. Ownership is the repository maintainer. Future breaking field, state, error, or
retention changes require a documented replacement and controlled cutover.

## Deferred intentionally

Stage 4 will expose event intake and connect these persistence contracts to the simulator and
worker. Stage 5 will turn workspace creation into the public demo-entry experience.
