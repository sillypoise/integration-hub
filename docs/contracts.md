# Integration Hub Contracts

## Contract record

- Owner: Repository maintainer.
- Version: `v2` simulated recovery contract; unchanged HTTP paths use a controlled cutover.
- Status: Accepted for the simulated commerce-to-CRM flow.
- Compatibility: Additive optional response fields are backward compatible. Removing, renaming, or
  repurposing a field, changing a state meaning, or making an optional field required is breaking.
- Deprecation: Breaking terms require a documented replacement and controlled cutover before
  removal. Stage 6 replaces the three-attempt-only baseline through the cutover below.

The requirements below are normative. Example values are illustrative.

## Source customer event

The server accepts one strict JSON object only after workspace authorization:

| Field                        | Requirement                                                              |
| ---------------------------- | ------------------------------------------------------------------------ |
| `p1_event_type`              | Literal `commerce.customer.updated`.                                     |
| `p1_idempotency_key`         | 1–64 ASCII letters, digits, `.`, `_`, `:`, or `-`; unique per workspace. |
| `p1_customer.p1_external_id` | Trimmed string, 1–64 characters.                                         |
| `p1_customer.p1_email`       | Valid email, at most 254 characters.                                     |
| `p1_customer.p1_first_name`  | Trimmed string, 1–80 characters.                                         |
| `p1_customer.p1_last_name`   | Trimmed string, 1–80 characters.                                         |
| `p1_customer.p1_updated_at`  | ISO 8601 timestamp with an explicit offset.                              |

Unknown fields are rejected. The serialized UTF-8 payload is limited to 16 KiB. Validation occurs
before persistence. A workspace can own at most 1,000 retained source events.

A repeated idempotency key returns the existing source event and synchronization run. It must not
create another logical run.

## Commerce simulator generator

The generator accepts `p1_customer_number` and `p1_revision`, both integers from 1 through 1,000,
and optional `p1_scenario`: `success` (default), `rate_limit`, `temporary_outage`,
`persistent_outage`, or `invalid_destination`. Unknown fields, coercible strings, customer details,
and adapter choices are rejected. The public event endpoint uses this same contract.

Identical inputs produce identical source events. The external customer ID depends only on the
customer number; the event idempotency key includes the revision and non-default scenario. Default
success keys are unchanged from Stage 4. Email addresses use the reserved `example.test` domain.
Source time is a logical timestamp: 2026-01-01 UTC plus revision seconds, not a claim about an
actual commerce-system update. Returned events and customer objects are frozen.

## Mapped customer

The destination-facing value is a strict object containing `p1_external_id`, `p1_email`,
`p1_first_name`, `p1_last_name`, and `p1_source_updated_at`. It carries no workspace token, provider
credential, or unaccepted source field. The pure mapping function validates the complete source
contract before selecting these fields, preserves the source timestamp including its offset, and
returns a frozen destination object without mutating its input.

## Synchronization job

The durable job payload contains UUIDs only:

- `p1_workspace_id`
- `p1_source_event_id`
- `p1_run_id`
- `p1_correlation_id`

The worker reloads accepted data through the workspace-scoped identifiers. Raw customer payloads and
credentials are prohibited in queue payloads.

## State machines

Synchronization run transitions are:

```text
queued → processing
processing → succeeded
processing → retryable_failure → processing (only when due)
processing → terminal_failure
terminal_failure → queued (one confirmed manual restoration)
queued/retryable_failure with stopped delivery → queued (one confirmed manual restoration)
```

`succeeded` is immutable. `terminal_failure` stops automatic processing. At most three automatic
attempts are allowed; attempt three cannot schedule another. One confirmed manual restoration can
queue one additional attempt, for at most four lifetime attempts. Workspace/run locks and expected
states prevent stale or cross-workspace mutation. The legacy internal transition helper retains its
three-attempt automatic-only budget; public recovery uses the transactional recovery repository.

Attempt states are `processing`, `succeeded`, `retryable_failure`, `terminal_failure`, and
`interrupted`. Attempt numbers are 1–4 and unique within a run.

## Workspace boundary

`POST /api/demo/workspaces` accepts no body and requires an `Origin` equal to the configured
application origin. Success returns safe workspace metadata and sets an opaque 256-bit token in the
host-only `p1_demo_workspace` cookie. The cookie is HTTP-only, SameSite Strict, path `/`, and Secure
when the configured application origin uses HTTPS. Only the SHA-256 token hash is stored.

`GET /api/demo/workspaces` returns safe metadata for an active cookie. Missing, malformed, unknown,
expired, and cross-workspace credentials are denied without distinguishing the reason. Workspaces
expire after 24 hours. At most 500 can be active, and cleanup deletes at most 100 expired workspaces
per invocation.

## Simulated synchronization HTTP API

These endpoints are owned by the repository maintainer. Every response is JSON with
`Cache-Control: no-store`. Every endpoint requires the workspace cookie; callers cannot supply a
workspace ID or adapter authority. The public source is synthetic and the destination is simulated.

- `POST /api/demo/events`: requires the exact configured `Origin` and an `application/json` body
  containing the two commerce-generator integers and optional scenario. Raw bodies are limited to 16
  KiB and five seconds; unknown fields, malformed JSON, invalid UTF-8, and out-of-range values
  return `400 INVALID_INPUT`. `p1_fields` is drawn only from `p1_customer_number`, `p1_revision`,
  and `p1_scenario`; body-level errors use an empty array. No rejected input is echoed.
- A new event returns `202` with `code: EVENT_ACCEPTED`, `duplicate: false`, `p1_run_id`,
  `p1_source_event_id`, and `p1_correlation_id`. This confirms durable acceptance, not successful
  synchronization. The correlation UUID equals the run UUID. A duplicate returns the same IDs,
  `duplicate: true`, and `200 DUPLICATE_EVENT`. Workspace expiry and capacity errors retain their
  existing `401` and `409` meanings.
- `GET /api/demo/runs?p1_page=1`: accepts one optional decimal page number, 1–50. Unknown or
  repeated query parameters, leading zeroes, and non-integer pages return `400 INVALID_INPUT`.
  Returns `p1_runs`, `p1_page`, and `p1_page_size: 20`; rows are sorted by creation time then UUID
  descending. Summaries include run/source IDs, state, delivery state, attempt count, and
  creation/completion timestamps. Pagination is a live view, not a snapshot across concurrent new
  events.
- `GET /api/demo/runs/{run_id}`: requires one valid UUID and no query parameters. Returns IDs,
  correlation ID, state, delivery state, counts/timestamps, safe source type/external ID/source
  time, scenario, safe run error code, manual retry count (0–1), the mapped destination effect or
  null, and at most four ordered attempts. Attempt fields are number, state, safe error code, start
  time, and completion time. `p1_destination_mode` is always `simulated`. Raw source payloads and
  cookies are never returned. Missing and other-workspace runs both return `404 RESOURCE_NOT_FOUND`
  after authentication; unusable cookies return `401` first.

All new endpoints return `503 DEPENDENCY_UNAVAILABLE` on dependency failure without database or
provider details. Public source fields cannot invoke real adapters. The destination snapshot is the
mapped result for this event, not a claim that it is still the customer's latest revision.

`p1_delivery_state` is pg-boss's `created`, `retry`, `active`, `completed`, `cancelled`, or
`failed`, or null after queue retention. It is separate from domain state: exhausted infrastructure
delivery can leave an unprocessed domain run `queued` with delivery state `failed`. This is
inspectable and never silently reported as success. One manual restoration is available for a
failed/cancelled delivery, but missing retained queue evidence alone does not authorize recovery.
Delivery has at most three executions, a 30-second lease, and two-second retry delays. PostgreSQL
supervision may reclaim expired leases later than 30 seconds; lease duration is not an end-to-end
latency promise.

Event/run/audit/queue insertion commits atomically. The simulated CRM effect and successful attempt
commit together; pre-commit interruption rolls both back, while post-commit replay is a no-op. These
guarantees apply to the database-backed simulator, not remote provider transactions. See
[ADR 0002](adr/0002-transactional-simulator-processing.md) for decisions and re-evaluation triggers.

## Operational UI and overview

Owner: repository maintainer. The original Stage 5 endpoint was additive. Stage 6 changes retryable
failures from attention to pending while delivery remains available and widens attempt counts to
four. These semantic changes require the controlled cutover below.

`GET /api/demo/overview` requires the existing workspace cookie and accepts no query parameters. It
returns `200` JSON with `Cache-Control: no-store`:

- `p1_total`, `p1_succeeded`, `p1_pending`, and `p1_attention`: integer counts, 0–1,000, for this
  workspace, read in one database statement. Success takes precedence over queue ACK failures;
  terminal domain failures and failed/cancelled deliveries count as attention. Scheduled retryable
  failures count as pending. Other retained runs count as pending. The three category counts sum to
  total.
- `p1_recent`: at most six run summaries, with the same fields as the run-list response, ordered by
  creation time then run UUID descending.
- `p1_expires_at`: the authorized workspace expiry as an ISO timestamp.

Errors are the existing `401 WORKSPACE_UNAUTHORIZED`, `400 INVALID_INPUT` for query parameters, and
`503 DEPENDENCY_UNAVAILABLE` without raw details. Expired workspaces cannot contribute records.

The public page `/` describes the simulation and opens `/demo`. Workspace creation occurs only on
explicit action. `/demo/runs` uses the existing 20-row pages; its status filter applies only to the
current page and is labeled accordingly. `/demo/runs/{run_id}` displays validated safe source
fields, mapped output, committed attempts, timestamps, and identifiers. `/demo/controls` accepts the
generator integers and scenario. Native validation precedes the server boundary.

Overview and lists are snapshots with manual refresh, not live metrics. Only active details poll: up
to 30 requests, one at a time, at two-second intervals and for at most 60 seconds per refresh
session. Each HTTP read has a five-second timeout. Polling stops on terminal/stopped/missing
delivery, errors, or navigation. A paused/failed refresh labels retained data stale. Unauthorized
and not-found responses clear previously rendered records. Manual refresh starts a new bounded
session.

The fresh-workspace control issues a new workspace cookie; it never claims to reset or delete the
old workspace. Old data follows existing expiry/cleanup. Reset and manual retry are separate,
explicitly confirmed controls. The public UI has no real-adapter option or credentials.

## Failure, retry, and reset (`v2`)

Owner: repository maintainer. Inputs/outputs are strict and bounded as described here. No fields are
deprecated; Stage 5 clients must reload at the controlled cutover in
[ADR 0003](adr/0003-bounded-simulated-recovery.md). Existing success intake, replay identity,
cookies, and error classes are preserved. New safe conflict codes are additive.

- Automatic retry waits five seconds after attempt one and ten after attempt two. Timestamps are
  not-before deadlines, not latency guarantees. Failure attempt, run, and next delayed job commit
  atomically. Rate limit recovers on attempt two, temporary outage on three, persistent outage
  exhausts, and invalid destination data never retries automatically.
- Safe attempt causes are `SIMULATED_RATE_LIMIT`, `SIMULATED_OUTAGE`, and
  `SIMULATED_INVALID_DESTINATION`. Run error adds `RETRY_EXHAUSTED` for the third failed attempt.
- `POST /api/demo/runs/{run_id}/retry` requires exact origin, workspace cookie, a valid run UUID, no
  query parameters, and JSON `{ "p1_confirm": true }` only. Accepts one restoration for a terminal
  run or a queued/retryable run with failed/cancelled delivery. Returns
  `202 { "code": "RETRY_ACCEPTED" }`. Active, successful, and previously restored runs return
  `409 RETRY_NOT_ALLOWED`; concurrent duplicates are denied without another job or audit event.
  Foreign/missing runs return `404 RESOURCE_NOT_FOUND` after authentication.
- `POST /api/demo/workspaces/reset` requires the same origin/cookie/query/body bounds, with
  `{ "p1_confirm": true, "p1_request_id": "<UUID>" }`. Cancels current jobs and deletes only owned
  synthetic source events, runs, attempts, CRM customers, and effects. Preserves session, expiry,
  and audits. Returns `200 { "code": "WORKSPACE_RESET" }`. Replaying a request UUID is a no-op, even
  if new events were accepted afterward. Three distinct resets per workspace are allowed; subsequent
  new requests return `409 RESET_LIMIT_REACHED`.
- Both endpoints use existing `400`, `401`, `403`, and `503` errors. Rejected inputs never echo
  request bodies. Mutation outcomes and denials emit safe structured decisions; successful mutations
  include transactionally committed `retry_requested` or `workspace_reset` audits.

The queue payload stays identifier-only. The current delivery job is tracked separately from the
stable run/correlation/effect UUID. Each job retains its own three-execution infrastructure bound. A
manual attempt restores only this run's simulator; it does not reconfigure a real provider.

## Safe HTTP errors

Errors contain one stable `code` and no stack, SQL, token, raw payload, or provider detail:

| Code                          | Meaning                                                 | HTTP status |
| ----------------------------- | ------------------------------------------------------- | ----------- |
| `INVALID_INPUT`               | Input shape, field, or body is invalid.                 | 400         |
| `WORKSPACE_UNAUTHORIZED`      | Workspace credential is unusable for the resource.      | 401         |
| `ORIGIN_DENIED`               | State-changing request origin is not allowed.           | 403         |
| `RESOURCE_NOT_FOUND`          | Authorized resource does not exist.                     | 404         |
| `DUPLICATE_EVENT`             | Event resolves to an existing logical run.              | 200         |
| `RETRY_NOT_ALLOWED`           | Run is active, successful, or manual recovery was used. | 409         |
| `RESET_LIMIT_REACHED`         | Three distinct workspace resets were used.              | 409         |
| `EVENT_LIMIT_REACHED`         | Workspace retained-event bound is reached.              | 409         |
| `WORKSPACE_CAPACITY_EXCEEDED` | Active public workspace bound is reached.               | 503         |
| `DEPENDENCY_UNAVAILABLE`      | A required dependency is unavailable.                   | 503         |
| `INTERNAL_ERROR`              | Unexpected internal failure.                            | 500         |

Database and provider errors are logged only as safe error classes. Authorization failures fail
closed and do not reveal whether a protected resource exists.

## Retention and ownership

Domain rows, including CRM customers and effect records, are owned by their `p1_workspace_id` and
cascade-delete with the workspace. Source events are immutable. Runs and attempts retain operational
history for the workspace lifetime. Audit rows record workspace creation, accepted events, retry
requests, and resets without raw customer data.

All project-owned tables, columns, and explicitly named indexes and constraints use the `p1_`
prefix. The only application-level exception is vendor-owned internals isolated in `p1_job` and
`p1_migrations`, as defined in [`database-naming.md`](database-naming.md).
