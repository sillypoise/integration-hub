# ADR 0002: Transactional Simulator Processing

- Owner: Repository maintainer.
- Status: Accepted for Stage 4's public simulator only.
- Confidence: High for the tested PostgreSQL transaction boundaries; no claim about remote adapters.
- Evidence: `src/lib/jobs/job_runtime.integration.test.ts`,
  `src/lib/synchronization/worker_interruption.integration.test.ts`, and
  `tests/browser/synchronization.spec.ts`.

Stage 6 extends this decision in [ADR 0003](0003-bounded-simulated-recovery.md): later delivery jobs
have separate UUIDs, scheduled failures become visible, and one manual restoration widens the
lifetime attempt/detail bound to four. Successful-effect transaction semantics remain unchanged.

## Decision

Persist the immutable source event, logical run, acceptance audit, and pg-boss job in one PostgreSQL
transaction. The producer uses pg-boss's custom database adapter with the caller's transaction
client. It does not start another worker or depend on a singleton shared across Next.js bundles.
Application startup creates the queue before opening HTTP intake.

Use the run UUID as the job ID, correlation ID, and destination-effect idempotency key. The worker
validates identifier-only jobs, locks the active workspace and matching queued run, maps the
accepted customer, records an attempt, upserts the simulated destination, and completes the attempt
and run in one transaction. An effect ledger prevents the same run from applying twice independently
of the run-state guard. A workspace/customer unique constraint converges different revisions onto
one CRM customer. Older or equal source timestamps cannot overwrite a newer customer.

This is deliberately a database-backed simulator, not a claim of distributed exactly-once delivery.
Processing is an internal transactional transition: readers usually see queued then succeeded, not
an artificially delayed processing state. An interrupted uncommitted attempt rolls back; pg-boss
tracks delivery retries separately from committed domain attempts. A lost acknowledgement after
commit causes a safe no-op when the job is delivered again.

## Alternatives and scope

A second commit for queue insertion leaves a crash gap. A separate outbox dispatcher repairs that
gap but adds polling, state, and recovery machinery unnecessarily when pg-boss already supports the
same transaction. A generic connector framework likewise has no current consumer. Both are rejected
for this stage (`SIMPLE-ADMIT-003`).

Remote adapters cannot participate in this database transaction. Stage 7 must revisit this decision
and use provider idempotency plus durable attempt/reconciliation semantics before claiming the same
recovery guarantee against Stripe or HubSpot. Stage 6 owns visible provider failure classification,
automatic domain retries, and manual retry controls.

## Bounds and resource sketch

- Intake: 16 KiB raw body, at most 16,385 stream reads, and a five-second read deadline.
- Worker: one job per batch, one local worker, 0.5-second polling, a 30-second lease, and two
  redeliveries after the initial delivery, with two-second retry delays.
- Database: five-second connection/query/statement deadlines; at most 1,000 events per workspace.
- Inspection: 20 summaries per page, at most 50 pages, three attempts and one effect per detail.
- Retention: queue records retained for at most a day after completion; workspace-owned simulator
  records cascade with the existing workspace cleanup.

Rough estimates, not benchmarks: a generated source event and mapped customer are each below 1 KiB;
1,000 events/day therefore add a few MB/day of logical rows before indexes/WAL/queue overhead. Each
successful event uses fewer than 20 SQL statements and two application database connections (intake
and processing), plus workspace authorization. At the planned daily workload, database round trips
and connection setup dominate the tiny mapping computation. A 20-row list is roughly 10 KiB or less;
body parsing allocates a fixed 16 KiB buffer per active intake. Revisit connection reuse or batching
only if measured contention or latency requires it; these estimates are not capacity guarantees.

## Release and compatibility

Migration `0003_create_crm_simulator.sql` adds two tables without changing existing domain columns.
Existing Stage 3 workspaces remain valid. Stage 3 exposed no public event-intake route, so there is
no public accepted-event backlog to backfill. Maintainer-created old runs are not automatically
submitted. The diagnostic producer and consumer are removed; the old private queue can be deleted
through pg-boss after the new deployment is healthy. No real adapter or credentials are enabled.
