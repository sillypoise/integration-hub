# Integration Hub Contracts

## Contract record

- Owner: Repository maintainer.
- Version: `v1` internal and HTTP contract baseline.
- Status: Accepted for the simulated commerce-to-CRM flow.
- Compatibility: Additive optional response fields are backward compatible. Removing, renaming, or
  repurposing a field, changing a state meaning, or making an optional field required is breaking.
- Deprecation: Breaking terms require a documented replacement and controlled cutover before
  removal. There are no deprecated terms in `v1`.

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

The internal generator accepts only `p1_customer_number` and `p1_revision`, both integers from 1
through 1,000 inclusive. Unknown fields, coercible strings, and client-provided customer details or
adapter choices are rejected. This is an additive internal contract, not yet a public HTTP endpoint.

Identical inputs produce identical source events. The external customer ID depends only on the
customer number; the event idempotency key includes the revision. Email addresses use the reserved
`example.test` domain. Source time is a logical timestamp: 2026-01-01 UTC plus revision seconds, not
a claim about an actual commerce-system update. Returned events and customer objects are frozen.

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
processing → retryable_failure → queued
processing → terminal_failure
```

`succeeded` and `terminal_failure` are terminal. A run has at most three processing attempts. A
third processing attempt cannot enter `retryable_failure`; it must resolve to a terminal state.
Compare-and-set persistence requires both the expected state and workspace ID, so stale or
cross-workspace transitions have no effect.

Attempt states are `processing`, `succeeded`, `retryable_failure`, `terminal_failure`, and
`interrupted`. Attempt numbers are 1–3 and unique within a run.

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

These additive `v1` endpoints are owned by the repository maintainer. Every response is JSON with
`Cache-Control: no-store`. Every endpoint requires the workspace cookie; callers cannot supply a
workspace ID or adapter authority. The public source is synthetic and the destination is simulated.

- `POST /api/demo/events`: requires the exact configured `Origin` and an `application/json` body
  containing only the two commerce-generator integers. Raw bodies are limited to 16 KiB and five
  seconds; unknown fields, malformed JSON, invalid UTF-8, and out-of-range values return
  `400 INVALID_INPUT`. `p1_fields` is a bounded array drawn only from `p1_customer_number` and
  `p1_revision`; body-level errors use an empty array. No rejected input is echoed.
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
  time, the mapped destination effect or null, and at most three ordered attempts. Attempt fields
  are number, state, safe error code, start time, and completion time. `p1_destination_mode` is
  always `simulated`. Raw source payloads and cookies are never returned. Missing and
  other-workspace runs both return `404 RESOURCE_NOT_FOUND` after authentication; unusable cookies
  return `401` first.

All new endpoints return `503 DEPENDENCY_UNAVAILABLE` on dependency failure without database or
provider details. Public source fields cannot invoke real adapters. The destination snapshot is the
mapped result for this event, not a claim that it is still the customer's latest revision.

`p1_delivery_state` is pg-boss's `created`, `retry`, `active`, `completed`, `cancelled`, or
`failed`, or null after queue retention. It is separate from domain state: exhausted infrastructure
delivery can leave an unprocessed domain run `queued` with delivery state `failed`. This is
inspectable and never silently reported as success; domain failure/retry actions arrive in Stage 6.
Delivery has at most three executions, a 30-second lease, and two-second retry delays. PostgreSQL
supervision may reclaim expired leases later than 30 seconds; lease duration is not an end-to-end
latency promise.

Event/run/audit/queue insertion commits atomically. The simulated CRM effect and successful attempt
commit together; pre-commit interruption rolls both back, while post-commit replay is a no-op. These
guarantees apply to the database-backed simulator, not remote provider transactions. See
[ADR 0002](adr/0002-transactional-simulator-processing.md) for decisions and re-evaluation triggers.

## Operational UI and overview (Stage 5)

Owner: repository maintainer. Compatibility: additive `v1` endpoint and UI; no database migration,
existing error-code change, or persisted-state change. Deprecation: none; the normal `v1` policy
above applies.

`GET /api/demo/overview` requires the existing workspace cookie and accepts no query parameters. It
returns `200` JSON with `Cache-Control: no-store`:

- `p1_total`, `p1_succeeded`, `p1_pending`, and `p1_attention`: integer counts, 0–1,000, for this
  workspace, read in one database statement. Success takes precedence over queue ACK failures;
  retryable/terminal domain failures and failed/cancelled deliveries count as attention. Other
  retained runs count as pending. The three category counts sum to total.
- `p1_recent`: at most six run summaries, with the same fields as the run-list response, ordered by
  creation time then run UUID descending.
- `p1_expires_at`: the authorized workspace expiry as an ISO timestamp.

Errors are the existing `401 WORKSPACE_UNAUTHORIZED`, `400 INVALID_INPUT` for query parameters, and
`503 DEPENDENCY_UNAVAILABLE` without raw details. Expired workspaces cannot contribute records.

The public page `/` describes the simulation and opens `/demo`. Workspace creation occurs only on
explicit action. `/demo/runs` uses the existing 20-row pages; its status filter applies only to the
current page and is labeled accordingly. `/demo/runs/{run_id}` displays validated safe source
fields, mapped output, committed attempts, timestamps, and identifiers. `/demo/controls` accepts
only the existing two generator integers. Native validation precedes the existing server boundary.

Overview and lists are snapshots with manual refresh, not live metrics. Only active details poll: up
to 30 requests, one at a time, at two-second intervals and for at most 60 seconds per refresh
session. Each HTTP read has a five-second timeout. Polling stops on terminal/stopped/missing
delivery, errors, or navigation. A paused/failed refresh labels retained data stale. Unauthorized
and not-found responses clear previously rendered records. Manual refresh starts a new bounded
session.

The fresh-workspace control issues a new workspace cookie; it never claims to reset or delete the
old workspace. Old data follows existing expiry/cleanup. Destructive reset and manual retry controls
are deferred to Stage 6. The public UI has no real-adapter option or credentials.

## Safe HTTP errors

Errors contain one stable `code` and no stack, SQL, token, raw payload, or provider detail:

| Code                          | Meaning                                            | HTTP status |
| ----------------------------- | -------------------------------------------------- | ----------- |
| `INVALID_INPUT`               | Input shape, field, or body is invalid.            | 400         |
| `WORKSPACE_UNAUTHORIZED`      | Workspace credential is unusable for the resource. | 401         |
| `ORIGIN_DENIED`               | State-changing request origin is not allowed.      | 403         |
| `RESOURCE_NOT_FOUND`          | Authorized resource does not exist.                | 404         |
| `DUPLICATE_EVENT`             | Event resolves to an existing logical run.         | 200         |
| `EVENT_LIMIT_REACHED`         | Workspace retained-event bound is reached.         | 409         |
| `WORKSPACE_CAPACITY_EXCEEDED` | Active public workspace bound is reached.          | 503         |
| `DEPENDENCY_UNAVAILABLE`      | A required dependency is unavailable.              | 503         |
| `INTERNAL_ERROR`              | Unexpected internal failure.                       | 500         |

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
