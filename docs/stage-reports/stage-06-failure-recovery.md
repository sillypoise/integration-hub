# Stage 6: Failure, retry, and recovery

## Status

Implementation and local validation complete. Hosted CI and deployment verification remain pending.

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
