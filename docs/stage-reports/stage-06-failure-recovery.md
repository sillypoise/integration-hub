# Stage 6: Failure, retry, and recovery

## Status

Complete. Local validation, hosted CI, Railway deployment, and public recovery checks passed.

## Delivered

- Five synthetic scenarios: success, rate limit, temporary outage, persistent outage, and invalid
  destination data. No real adapter authority or raw customer input.
- Three automatic attempts with durable five-/ten-second delays, visible deadlines, safe causes, and
  explicit retry exhaustion. Delayed retries commit with failed attempts; no in-memory timers.
- One confirmed workspace/run-scoped manual restoration, at most four lifetime attempts, and one
  audit event. Concurrent duplicate, active, successful, and foreign retry requests are denied.
- Confirmed workspace reset cancels current jobs through pg-boss and deletes only owned synthetic
  records. Audits/session/expiry remain; request UUID replay is harmless; three resets maximum.
- Responsive scenario controls, recovery confirmation, preserved attempt histories, and correct
  pending/attention classification. Detail polling retains its 30-request/60-second bound.
- One forward-only migration; no new dependency, service, or provider connection.

## Validation

`just validate` passed formatting, strict lint, typecheck, 166 unit/integration tests, the
production build, and 30 desktop/mobile browser checks. Configured server/contract coverage was
99.36% statements and 99.35% branches; this is not React component coverage. An initial browser
timeout was shorter than the intentional 15-second retry schedule; only the affected recovery tests
now have explicit 30-/45-second budgets, without changing the global test timeout.

PostgreSQL checks cover automatic recovery and exhaustion, terminal failure, early/replayed jobs,
durable retry across worker restart, concurrent manual retry, rollback after scheduling, schema
bounds, transport recovery, reset replay/bounds/isolation, and reset racing effect processing. HTTP
checks cover exact origin, authorization order, strict confirmation/request identifiers, unknown
input/query parameters, safe dependency failure, and stable conflict errors.

Desktop and Pixel 7 emulation exercise real timers and workers, exhaustion, manual restoration,
reset, automatic third-attempt recovery, and foreign recovery denial. Screenshots reviewed for
exhaustion and restoration show readable responsive controls and preserved failure history.
Checkboxes require confirmation and receive native invalid-submit focus. This is not a formal
accessibility certification or physical-device test.

## Hosted evidence

- Implementation commit `1bf2d4c` passed
  [CI run 33940590833](https://github.com/sillypoise/integration-hub/actions/runs/33940590833) in
  5m5s, including empty-database migrations, all tests, and production-container smoke testing.
- Old deployment was confirmed `REMOVED` before the Stage 6 deployment. PostgreSQL and service
  configuration were preserved. Deployment `ba1a60c9-6532-4344-888f-f0346c0d9e24` reached `SUCCESS`;
  migrations, application startup, liveness, and readiness passed.
- Real hosted Desktop Chrome and Pixel 7 flows exhausted runs `266928f8-0ceb-4bde-a90d-b99f97996722`
  and `001f17ca-0138-4560-8f9c-cd51601b0e7c`, then restored each on attempt four. Foreign retry
  returned `404`, foreign origin `403`, repeated retry `409`, and anonymous reset `401`. UI reset
  removed only the probe's records; other-workspace reset did not affect the owner run. Duplicate
  reset requests were harmless.
- Hosted automatic probes: rate limit `8e70a63f-c7d2-4ef4-9dec-15df58cbc970` succeeded on attempt
  two; temporary outage `feca2f59-1ca2-4f61-a576-b10dcc8a9258` succeeded on three; invalid
  destination `b952ce32-9767-4a86-b964-bc2367fee909` stopped on one with no next attempt/effect.
  Their overview returned two succeeded, one attention, zero pending, and `no-store`. An unsupported
  `real` scenario returned `400`.
- Read-only hosted database inspection confirmed five migrations and, across the two reset UI probe
  workspaces, two each of workspace-created, event-accepted, retry-requested, and workspace-reset
  audit rows. Reset did not erase the audit trail.

## Contract and operating notes

[ADR 0003](../adr/0003-bounded-simulated-recovery.md) records admission, alternatives, resource
upper bounds, and the controlled `v2` cutover. Attempt widening and retry-category semantics are
breaking for old browser validators; reload old tabs. Stop Stage 5 before enabling scenario jobs,
apply the forward migration, and deploy the web/worker together. Do not roll back to the
scenario-unaware worker after Stage 6 usage. Existing success events and idempotency keys are
preserved.

Infrastructure delivery still has a separate bounded retry policy; no remote exactly-once claim.
Request-rate hardening, representative billing/capacity measurement, and real sandbox adapters
remain later stages. No portfolio outcome or performance metric is fabricated.

Guide trace: `SIMPLE-ADMIT-002/003` reuse existing queue/transactions; `SAF-02/11` enforce and test
bounds/failures; `SECCORE-AUTH-002` scopes all mutations; `CONTRACT-CHG-001/002` records the cutover
and negative checks; `EPI-CLAIM-001` requires hosted evidence before completion.
