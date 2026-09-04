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

## Mapped customer

The destination-facing value is a strict object containing `p1_external_id`, `p1_email`,
`p1_first_name`, `p1_last_name`, and `p1_source_updated_at`. It carries no workspace token, provider
credential, or unaccepted source field.

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

Domain rows are owned by their `p1_workspace_id` and cascade-delete with the workspace. Source
events are immutable. Runs and attempts retain operational history for the workspace lifetime. Audit
rows record workspace creation, accepted events, retry requests, and resets without raw customer
data.

All project-owned tables, columns, and explicitly named indexes and constraints use the `p1_`
prefix. The only application-level exception is vendor-owned internals isolated in `p1_job` and
`p1_migrations`, as defined in [`database-naming.md`](database-naming.md).
