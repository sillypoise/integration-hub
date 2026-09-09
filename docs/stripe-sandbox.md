# Maintainer-only Stripe source evidence

Owner: repository maintainer. This is an opt-in, synthetic Stripe test-customer snapshot feeding the
existing PostgreSQL queue/worker and simulated CRM. It is not a webhook consumer, continuous Stripe
synchronizer, real CRM adapter, or production-customer importer. Public integrations remain
simulated.

## Run

Use the disposable local PostgreSQL instance and the existing ignored `.env.local`. Set a maintainer
Stripe **test-mode** secret key as `STRIPE_SECRET_KEY`; never copy it to Railway, CI, command
arguments, reports, or source control. No provider SDK or new dependency is needed for these fixed
HTTP calls.

```bash
just database-start
just database-migrate
just stripe-evidence create-and-delete-test-customer
```

This explicit confirmation authorizes creation and deletion of **one owned synthetic test
customer**. The command first reads the authenticated account identity, creates the fixture, reads
its snapshot, checks persisted CRM state and duplicate replay, then revalidates ownership and
deletes that fixture. It never lists, changes, or deletes existing unrelated customers and never
creates payments or subscriptions. Only the account ID is retained from the account response; other
account fields are neither logged nor persisted. Do not attach other test objects to its temporary
customer.

Run this workflow alone, not concurrently with database-destructive tests. It accepts only
`postgresql://...@127.0.0.1:5432/integration_hub` with no query/fragment and local SSL disabled;
`NODE_TLS_REJECT_UNAUTHORIZED=0` is denied. That port must belong to the disposable local container,
not a hosted-database tunnel. Local synthetic workspaces expire after the ordinary 24 hours.

## Private contract

- Provider: fixed `https://api.stripe.com`, API version `2026-08-26.dahlia`, native TLS
  verification, redirect denial, and no endpoint/live-mode override. One request per operation, no
  automatic HTTP retry, no pagination, no background Stripe calls.
- Operations: read account identity; create/read/delete the one fixture. Each request has an
  eight-second deadline; response JSON uses the shared 16 KiB/five-second bounded stream reader. The
  CLI has a 150-second outer budget and a further ten-second forced-stop budget.
- Fixture: `Portfolio Fixture`, `stripe-fixture@example.test`, `livemode=false`, expected customer
  ID, and matching `p1_stripe_probe` UUID / `p1_updated_at` metadata. All consumed fields must
  match. Unconsumed provider fields are stripped for additive compatibility, not persisted.
- Mapping: validated Stripe ID/email/name and fixture revision timestamp enter the existing strict
  commerce event contract. The timestamp is **explicit fixture metadata**, not an invented Stripe
  customer-update timestamp. SHA-256 of the customer ID and probe UUID gives a stable 64-character
  local idempotency key; it contains no credentials or personal data.
- Errors: private adapter results use `INVALID_INPUT` (configuration/invalid response),
  `DEPENDENCY_UNAVAILABLE` (authentication/transport/provider), `REQUEST_LIMIT_REACHED` (429), and
  `RESOURCE_NOT_FOUND` (404), with bounded reason values. Raw bodies/errors are never diagnostics.
  Request diagnostics contain only method, HTTP status, and a validated optional Stripe request ID.
- A rate limit stops this invocation rather than busy-retrying or trusting an arbitrary wait hint.
  Wait before rerunning; the same retained journal governs any retry. A timeout does not imply a
  remote write was rolled back or stopped.
- Overall success requires zero exit status **and** both `stripe_sync: verified` and
  `stripe_cleanup: verified`. A `previous_fixture_already_deleted` result is cleanup recovery only,
  not fresh synchronization evidence. Other failures emit `STRIPE_EVIDENCE_FAILED` and a journal
  hint.

The normalized event, public HTTP behavior, and database schema are unchanged. The shared JSON
reader now accepts the common request/response fields structurally; existing request callers remain
valid. This private opt-in contract is additive. Future changes to fixture identity or request
parameters must first reconcile any pending journal; never reuse a create idempotency key with
changed inputs.

## Interruption and cleanup

The single mode-0600 journal `.tools/stripe-evidence.json` records the verified account ID, probe
UUID, start time, and optional customer/workspace IDs—not credentials, account details, or raw
payloads. It is limited to 1 KiB, strictly parsed, written by atomic replacement, and synced before
dependent remote work. Account changes fail closed. A lock excludes concurrent invocations.

On a failed call, keep the journal and rerun the same confirmed command. Unknown create outcomes
reuse the same Stripe idempotency key and identical fields. The command refuses unknown outcomes at
23 hours or later because Stripe may prune idempotency records after 24 hours. A known customer can
still be inspected for cleanup after that limit. Ownership mismatches, ambiguous deletes, and failed
confirmation reads preserve the journal instead of deleting unrelated data or assuming success.

Abrupt termination can leave `.tools/stripe-evidence.lock`. Confirm the previous process has stopped
before removing **only that lock**. Never delete a pending journal merely to unblock another create.
For a stale unknown outcome, use the original account's Stripe test dashboard to locate the exact
`p1_stripe_probe` metadata UUID, reconcile/delete only the owned fixture, and then remove its
journal. The maintainer owns this manual recovery; no automatic broad customer search or deletion is
admitted.

## Public isolation and evidence

`maintainer/` is outside `src/`, excluded from the Podman context, and omitted by the
Containerfile's explicit build allowlist. An accidental runtime import fails the container build
rather than bundling an adapter. Container smoke checks assert that the maintainer directory is
absent; bundle inspection also denies provider markers. CI exercises mocked provider boundaries and
real disposable PostgreSQL, never the opt-in sandbox command or a Stripe credential.

Offline tests cover auth/configuration denial, malformed/oversized responses, timeout, rate
limiting, account mismatch, journal replay, unknown create/delete outcomes, cleanup ownership,
enqueue rollback, and duplicate CRM effects. These checks are not real outage or live-provider fault
injection claims. At this scale, a normal probe makes five small sequential HTTPS calls, admits one
event, and retains one sub-1-KiB journal; network waits dominate. These are bounds/estimates, not
throughput measurements.

References: [Stripe idempotency](https://docs.stripe.com/api/idempotent_requests),
[customer retrieval](https://docs.stripe.com/api/customers/retrieve),
[customer deletion](https://docs.stripe.com/api/customers/delete),
[API schema](https://github.com/stripe/openapi/blob/master/openapi/spec3.json).
