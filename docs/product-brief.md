# Integration Hub Product Brief

## Decision status

- Owner: Repository maintainer.
- Status: Proposed baseline for implementation planning.
- Confidence: Medium. The scope follows the portfolio strategy, but usability and hosting cost have
  not yet been validated with a working deployment.
- Re-evaluation triggers: A required integration cannot be exercised safely in a sandbox; the
  selected host cannot run bounded background jobs reliably; or the monthly operating estimate
  exceeds the budget below.

## Product boundary

Integration Hub demonstrates one commerce-to-CRM customer synchronization and the operational work
needed to understand and recover failed records. It is not a workflow builder, integration
marketplace, enterprise multi-tenant platform, or high-scale event-processing benchmark.

The public demo uses a clearly labeled commerce simulator so every visitor can exercise the flow
without shared credentials or external side effects. A maintainer-only test environment will use one
real third-party sandbox before the project claims real integration capability.

## 1. Client problem

A small operations team needs customer changes from its commerce system reflected in its CRM.
Failures currently produce stale records and manual spreadsheet reconciliation because the team
cannot see which records failed, why they failed, or whether retrying is safe.

The product proves that we can validate external data, process synchronization work in the
background, prevent duplicate effects, expose useful operational state, and support bounded
recovery.

### Explicit non-goals

- Arbitrary user-authored workflows or field-mapping languages.
- More than one source-to-destination integration pair.
- Billing, organizations, invitations, or enterprise role administration.
- Claims of production scale, uptime, or customer outcomes.
- Kubernetes, microservices, or shared runtime packages.

## 2. Primary vertical flow

1. A visitor enters the isolated public demo and creates or selects a simulated customer update.
2. The application validates the payload before any persistent state change.
3. It persists an immutable source event and queues a synchronization attempt.
4. A bounded worker maps the accepted fields and upserts the destination customer using an
   idempotency key.
5. The UI shows queued, processing, succeeded, retryable-failure, or terminal-failure state.
6. A permitted user can inspect a failed attempt and request one bounded retry.
7. The retry either succeeds or returns to a visible failure state with a stable error class.

The revised maintainer-only test scope uses Stripe test mode as the source and keeps the existing
simulated CRM destination. The maintainer approved deferring HubSpot rather than adding another
provider solely to complete the stage. This source-only evidence remains pending and must not be
presented as a real external CRM integration. The decision and validation conditions are recorded in
[`tech-stack.md`](tech-stack.md) and [`implementation-plan.md`](implementation-plan.md).

## 3. Failure and recovery behavior

### Required failure classes

- Invalid source payload: reject before persistence or external calls; return field-level feedback.
- Unauthorized action: deny without revealing protected connection details.
- Duplicate event: preserve one logical customer update and report the duplicate safely.
- Destination rate limit or temporary outage: schedule a bounded retry with visible next-attempt
  time.
- Invalid destination data: stop automatic retries and expose a terminal, actionable error.
- Worker interruption: leave durable work recoverable without duplicate destination effects.
- Retry exhaustion: enter a terminal state; never retry forever.

Retry counts, time limits, payload sizes, and retention periods must be explicit in the technical
plan. Recovery controls must be idempotent and scoped to the current demo workspace.

## 4. Security boundaries

- Browser input, webhook-like simulator input, and third-party responses are untrusted and must be
  validated at their first server boundary.
- Integration credentials exist only in server-side secret storage and must never enter browser
  bundles, logs, screenshots, metrics labels, or error responses.
- Public visitors receive isolated, expiring demo workspaces. One visitor cannot inspect, retry,
  reset, or alter another visitor's records.
- Public demo actions can affect only simulated destinations. Real sandbox actions require
  maintainer authorization and are disabled in the public deployment.
- Retry and reset operations require explicit, resource-scoped authorization and emit an audit
  event.
- User-facing failures expose stable error classes and safe explanations, not stack traces or raw
  third-party responses.
- Seed and reset operations use synthetic data only and have bounded request and workload limits.

## 5. Operating budget

### Initial constraints

- Target recurring public-demo cost: USD 0–15 per month.
- Hard planning ceiling: USD 25 per month without a documented scope or hosting decision review.
- Expected traffic: portfolio evaluation, not production traffic; plan for at most 100 visits and
  1,000 simulated synchronization events per day.
- Demo data may be short-lived. Retention should be no longer than needed for evaluation.
- Prefer one application deployment, one PostgreSQL database, and the minimum additional managed
  infrastructure needed for reliable bounded jobs.

These are design constraints, not measured costs or capacity claims. The deployment plan must cite
current provider pricing and estimate compute, database, network, storage, and job-processing cost
before selecting a host.

## 6. Acceptance criteria

### Product

- A public introduction explains the business problem and labels the project accurately.
- Three to five polished responsive screens cover overview, synchronization runs, run detail, and
  connection or demo controls.
- A visitor can run the complete simulated synchronization without credentials or assistance.
- Loading, empty, invalid-input, permission-denied, success, retryable-failure, terminal-failure,
  and recovery states are visible and intentional.

### Correctness and contracts

- Source inputs, destination outputs, job states, and stable error classes have explicit contracts.
- Persistence occurs only after validation, and external side effects are idempotent.
- Automated tests cover valid input, invalid input, duplicate delivery, retry boundaries, retry
  exhaustion, authorization denial, and worker interruption recovery.
- Queue, retry, payload, batch, and retention limits are explicit and tested at their boundaries.

### Security and privacy

- Public workspaces are isolated and expire safely.
- Public controls cannot call real external systems or affect another visitor.
- Secrets and raw sensitive payloads are absent from client responses and telemetry.
- Privileged operations have server-side, resource-scoped authorization tests.

### Evidence and delivery

- At least one maintainer-only test exercises the real sandbox adapter end to end, or public claims
  state clearly that both endpoints are simulated.
- The repository documents architecture, local setup, tests, deployment, tradeoffs, simulation
  boundaries, and a safe reset path.
- Deployment instructions are verified from a clean environment where practical.
- The deployed application is responsive at representative mobile and desktop widths.
- Screenshots and a short reproducible walkthrough are captured only after acceptance checks pass.

## Considered alternative

A generic connector builder would display more screens and abstractions, but it would require a
mapping language, credential lifecycle, broader contracts, and many shallow code paths. The narrow
commerce-to-CRM sync is preferred because it provides stronger evidence of integration,
background-processing, database, security, and recovery skills with a reviewable deployment scope.
