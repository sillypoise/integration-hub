# Stage 4 Report: Simulated Synchronization

## Status

Complete. Local validation, hosted CI, production-container smoke testing, and Railway
migration/HTTP/database verification passed.

## Delivered

- Deterministic synthetic commerce events and pure, validated customer mapping.
- Atomic source-event, run, audit, and pg-boss job acceptance; identifier-only job payloads.
- Database-backed CRM customer upsert and per-run effect ledger with workspace ownership.
- Worker transaction covering mapping, attempt, effect, and successful completion.
- Safe no-op replay, stale-update protection, and bounded pg-boss delivery retries.
- Workspace-scoped event intake, paginated run listing, and run detail endpoints.
- Safe source projection, mapped effect, attempt history, correlation IDs, and delivery status.
- Forward-only migration `0003_create_crm_simulator.sql` and retirement of diagnostic runtime code.
- Production-entry-point Playwright tests exercising the actual worker, not just `next start`.

## Evidence

- PostgreSQL tests prove concurrent duplicate convergence, atomic enqueue rollback, destination
  rollback after effect insertion, restart completion, destination idempotency, stale-event
  handling, workspace denial, exhausted attempt denial, pagination limits, and CRM foreign-key
  enforcement.
- A separate Node process is killed with SIGKILL while blocked at its CRM write. PostgreSQL rolls
  back its uncommitted run/attempt, and the registered worker subsequently completes the durable
  job.
- Queue tests exercise the two-redelivery limit and verify stored queue errors exclude injected
  secret-like database details.
- HTTP tests cover origin denial, malformed/oversized/invalid-UTF-8/slow bodies, strict synthetic
  fields, authentication, cross-workspace detail denial, stable duplicates, page bounds, and safe
  dependency errors.
- Five Playwright checks pass against the production server, including complete synchronization and
  independent visitor isolation. Formatting, type-aware lint, typecheck, build, and coverage pass.

## Hosted verification

- Commit `598960d` passed
  [CI run 33932468932](https://github.com/sillypoise/integration-hub/actions/runs/33932468932):
  empty PostgreSQL 17 migrations, 110 tests, 99.01% statement coverage, five Playwright checks,
  production build, and OCI container smoke test.
- Railway deployment `b00d5c27-5528-4376-a9de-c1f67f15feab` passed pre-deploy migration and
  readiness. Hosted history contains four migrations.
- Run `85fe8df8-fac1-479e-b9b8-eec9f259076b` accepted a generated customer event and completed with
  one CRM effect, one customer, one successful attempt, and zero pg-boss retries. Repeated intake
  returned the same run. Hosted logs correlate both intake responses and worker completion.
- HTTPS probes confirmed `202` acceptance, `200` duplicate/read, `400` invalid input, `401` missing
  credentials, `403` foreign origin, and `404` cross-workspace detail. Responses were non-cacheable.
- The retired diagnostic queue was verified to have no pending/active jobs and then removed using
  pg-boss's queue deletion API. Public actions still cannot invoke real provider adapters.

## Contract and design review

New routes and two simulator tables are additive. Existing workspace credentials remain valid. The
public API cannot accept raw customer identities or choose a real adapter. The run UUID is the
correlation and effect-idempotency key. No shared runtime service, new dependency, outbox
dispatcher, or connector framework was added. See [`../contracts.md`](../contracts.md) and
[ADR 0002](../adr/0002-transactional-simulator-processing.md).

These are simulator transaction guarantees, not remote-provider exactly-once claims. Uncommitted
processing attempts roll back and are not displayed as committed history. Transport retry counts are
separate from domain attempt counts; transport exhaustion is visible as `p1_delivery_state: failed`,
even if the unprocessed domain run remains queued.

## Deferred intentionally

Stage 5 owns the operational UI. Stage 6 owns provider-failure simulations, domain retry and manual
recovery controls. Stage 7 must revisit transaction boundaries for real remote sandbox adapters.
Broad public request-rate hardening remains in Stage 8; present payload, event, workspace, queue,
and inspection bounds remain enforced.
