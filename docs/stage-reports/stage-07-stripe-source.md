# Stage 7: Stripe source sandbox evidence

## Status

Complete. Implementation `2b8ec8f` passed real sandbox verification and hosted CI/image-isolation
checks. Approved scope: **Stripe test-mode source → simulated CRM**. HubSpot remains deferred. The
public source and destination stay simulated; this is not an external CRM integration or production
case.

## Delivered

- Maintainer-only fixed-origin, version-pinned Stripe calls with strict consumed-field validation,
  test-mode/fixture ownership checks, byte/time bounds, safe failure classes, and redacted
  diagnostics.
- Existing normalized event, transactional intake, pg-boss worker, CRM mapping, and replay
  protection reused without schema changes, a connector framework, or new dependencies.
- An opt-in confirmed command and one durable account-bound fixture journal. Unknown writes retain
  their replay identity; ambiguous deletes retain cleanup responsibility. Stale unknown outcomes,
  account changes, malformed journals, and unsafe database targets fail closed.
- `maintainer/` excluded from the public image and its build allowlist. CI checks absence and runs
  only offline provider fixtures with disposable PostgreSQL—never live Stripe credentials.

See [sandbox setup, contract, and recovery](../stripe-sandbox.md).

## Sandbox evidence

`just stripe-evidence create-and-delete-test-customer` completed twice, each time creating and
removing only its own synthetic test customer. The final checked run was
`1f7bfca3-6370-4da8-b366-c01554c2378f`.

- Account authentication, creation, snapshot retrieval, ownership revalidation, and deletion all
  returned HTTP 200 using API version `2026-08-26.dahlia`.
- Final Stripe request IDs: create `req_pmL6SqWhxwzR0U`, snapshot `req_gCxkyjkXhylN5f`, cleanup read
  `req_DYKNsIj8L3Ufyq`, delete `req_r9SBTOMX0fUNNs`.
- The script verified persisted mapped fields, repeated intake returning the same run, successful
  worker completion, and ignored duplicate worker delivery.
- A separate read-only local query confirmed: succeeded, one attempt, one event, one run, one CRM
  customer, and one CRM effect in the owned workspace.
- Deletion receipts matched the owned customer IDs. The journal and lock were absent after confirmed
  cleanup. No payments/subscriptions were created, and unrelated customers were not listed or
  altered.
- Initial connectivity failures were resolved before implementation. No inference about their cause
  or a provider outage is made from those earlier timeouts.

## Validation

- Local `just validate` passed 251 unit/integration tests, 34 desktop/mobile browser checks,
  formatting, strict lint/types, build, public-bundle inspection, and dependency audit.
- Offline checks cover credential/configuration rejection, URL query-based database overrides,
  account mismatch, timeout, rate limiting, exact response byte boundaries, invalid provider fields,
  cleanup ownership, unknown outcomes, journal locking/symlinks/interrupted replacement, local
  enqueue rollback, and duplicate CRM effects. These are not claims of live provider fault
  injection.
- Public bundles remained 1,026,188 checked JavaScript bytes with no checked provider/server markers
  or source maps. No Stripe credential was installed in Railway or CI.
- The local container built from the explicit allowlist without maintainer code or pre-generated
  Next.js types. Runtime checks confirmed UID 10001 and absent maintainer/global Node-tool paths;
  its all-severity image scan reported zero findings.
- Hosted [CI 34293538790](https://github.com/sillypoise/integration-hub/actions/runs/34293538790)
  passed all gates, including production-container startup, readiness, and maintainer-code absence.
  The retained image report contains 94 packages and zero findings at all severities, without
  ignores. Report SHA-256: `34c3c5464069be19f57e045341557b6b22c553b6bc71aa575c66ef75bd8127fc`.
- CI coverage was 99.52% statements / 97.69% branches / 98.75% functions / 99.48% lines in the
  configured scope, not the whole application. The public Stage 8 deployment is unchanged; the
  private sandbox command is not a public feature and did not require a public deployment.

## Limits and guide trace

The adapter accepts only the owned synthetic fixture, not arbitrary customer names or updates. Its
revision timestamp is explicit fixture metadata, not a Stripe customer-updated field. Retries are
manual and bounded by the retained journal; use the original account/key until reconciliation. The
maintainer owns stale-unknown-outcome dashboard cleanup and removal of a lock after confirmed
process termination. Fixture and local database evidence is ephemeral, not a long-term retention
claim.

Confidence: high for the observed source read, persisted simulated effect, replay, and cleanup; no
claim of production scale or general provider reliability. Repository-wide assertion density remains
unmeasured. Oxfmt retains one 103-column import in `maintainer/stripe_sync.ts` (`FMT-03`); a scoped
TypeScript expected-error directive tests an untyped invalid operation (`SAF-17`).

Guide trace: `SIMPLE-ADMIT-002/003` narrow source and reused persistence; `SECCORE-AUTH-002` owned
fixture/account checks; `SAF-02/11` bounded work and negative paths; `CIS-07` unknown-write
recovery; `CONTRACT-COMP-003` unchanged public behavior; `EPI-CLAIM-001/002` real versus mocked
evidence.
