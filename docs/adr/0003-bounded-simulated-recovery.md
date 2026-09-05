# ADR 0003: Bounded simulated failure and recovery

- Status: Accepted and deployed in Stage 6.
- Owner: Repository maintainer.
- Scope: Public synthetic commerce-to-CRM synchronization only.

## Decision

Admit one forward-only migration and reuse pg-boss transactional sends. Do not add a scheduler,
outbox, remote provider, generic retry framework, or service. A failed attempt, safe failure code,
next-attempt timestamp, and delayed identifier-only job commit together. The worker still locks the
active workspace before the run. Early delivery is a no-op; due retries can proceed from
`retryable_failure` to `processing`. The CRM effect remains transactional with successful
completion.

Automatic processing has at most three committed attempts, with five- and ten-second delays. Rate
limit fails once, temporary outage twice, persistent outage exhausts three attempts, and invalid
destination data stops immediately. Exhaustion is `terminal_failure` with `RETRY_EXHAUSTED`; the
last attempt retains its actual simulated cause. Uncommitted infrastructure failures still use the
separate pg-boss delivery budget (three executions per job), not fabricated domain failures.

Allow one explicitly confirmed manual restoration per run, including after exhaustion. It restores
only that run's simulated destination and queues one more attempt, preserving previous failures. The
lifetime bound is four committed attempts, not another unbounded retry cycle. Active, successful,
and previously manually retried runs are denied. Concurrent duplicate requests return one acceptance
and conflicts for the others, with one audit event. Missing queue evidence is not assumed to prove a
stopped delivery; such runs require a new revision or workspace reset.

A nullable delivery-job pointer falls back to the original run UUID for existing jobs. Later jobs
get random UUIDs while the run UUID remains the correlation/effect key. List/detail/overview read
only the current delivery, never an old completed retry. No customer data enters queue payloads.

## Reset

Reset shares the workspace lock with intake, processing, and manual recovery. It cancels current
jobs through the pg-boss API in the same transaction, deletes owned source events (cascading runs,
attempts, and effects) and simulated customers, and preserves the cookie, expiry, and audit history.
Stale deliveries cannot recreate deleted runs. A client-generated request UUID is scoped to the
workspace and stored with the audit. Replaying it returns success without deleting later events. At
most three distinct resets are admitted during a workspace's lifetime.

## Alternatives and cost bounds

- Reusing the existing three-attempt cap would prevent demonstrating manual recovery after
  exhaustion. A single fourth attempt is smaller than new runs, retry chains, or reset counters per
  retry cycle.
- Scheduling with an in-memory timer would lose work on restart. pg-boss already supplies durable
  delayed delivery and is reused without an extra polling service.
- Deleting/replacing the workspace would erase audit evidence or duplicate the fresh-session UI.
  Scoped deletion preserves both the session and security evidence.

At most 1,000 retained runs produce 4,000 committed attempts and 4,000 delivery jobs. Including
three resets, a workspace can admit at most 4,000 events over its 24-hour life, 16,000 jobs, and
roughly 8,004 audit rows. At an illustrative 1 KiB per queue row before indexes, that is 16 MiB per
workspace and approximately 8 GiB at the 500-workspace maximum, not an observed workload or cost
promise. The single worker processes one job per batch; each retry adds one bounded transaction and
no external network call. Request-rate hardening and measured capacity/billing remain Stage 8 work;
the existing USD 25 ceiling is unchanged. Reset does not restart workspace expiry.

## Compatibility and cutover

Migration `0004_clumsy_sandman.sql` adds defaulted/nullable fields and widens the attempt
constraint. Existing source payloads and success job UUIDs remain unchanged. New code reads
pre-migration rows through defaults and the delivery-pointer fallback after the migration is
applied. Old code can operate on migrated success rows, but **must not process new scenario/manual
jobs**: it would ignore scenario behavior and cannot process the fourth attempt.

Therefore the release must stop the Stage 5 deployment before starting Stage 6 (brief public-demo
maintenance), run the forward migration, then verify the new application and worker together. Do not
roll back the application to Stage 5 once failure controls have been used; fix forward. Already-open
old browser tabs may reject four-attempt responses and must reload. The HTTP contract is revised to
`v2`; unchanged endpoint names are retained for this controlled public-demo cutover.

## Evidence and re-evaluation

`recovery_repository.integration.test.ts` exercises actual PostgreSQL transactions, deadlines,
restart, concurrent retry, transport recovery, schema bounds, rollback, and reset isolation.
`recovery_http.test.ts` exercises authorization order, origin, strict inputs, and safe failures.
`tests/browser/recovery.spec.ts` uses real timers and workers on desktop and mobile emulation.

High confidence in the tested simulator invariants; no claim of remote exactly-once effects or
production capacity. Real adapters (Stage 7), changed attempt budgets, or queue topology changes
require revisiting this decision and ADR 0002 before implementation.
