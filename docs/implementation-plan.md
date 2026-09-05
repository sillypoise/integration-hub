# Integration Hub Implementation Plan

## Planning rules

- Owner: Repository maintainer.
- Status: Accepted implementation sequence.
- Goal: Ship the smallest polished product that proves one reliable commerce-to-CRM sync.
- Delivery model: Complete and validate one stage before expanding the next stage.
- Scope rule: Work not required by the product brief or a stage exit gate is deferred.
- Evidence rule: A stage is complete only when its commands and behavior are reproducible.
- Reporting rule: Add a compact report under `docs/stage-reports/` when each stage completes.

## Stage 1: Application foundation

**Status:** Complete. Verified from a clean temporary working directory using the pinned Node.js
version and a Podman-hosted PostgreSQL database. See
[`stage-01-foundation.md`](stage-reports/stage-01-foundation.md).

### Outcome

A strict, locally runnable Next.js application with PostgreSQL, quality checks, and no product
behavior yet.

### Work

- Scaffold Next.js App Router with Node.js 22, pnpm, strict TypeScript, and Tailwind CSS.
- Pin dependencies and commit the lockfile.
- Configure Oxlint, Oxfmt, Vitest, Playwright, and warnings-as-failures checks.
- Document a bounded Podman command for local PostgreSQL 17 with an explicit health check.
- Add typed startup configuration that fails on missing or invalid required values.
- Add Drizzle configuration and an empty initial migration workflow.
- Add a minimal application shell and `/health/live` endpoint.
- Add CI for install, formatting, lint, typecheck, test, and build.

### Exit gate

- A clean checkout can install, start PostgreSQL, migrate, run the app, and pass CI commands.
- Invalid startup configuration fails immediately without printing secrets.
- The application build contains no client-exposed server credentials.

## Stage 2: Deployment and worker lifecycle spike

**Status:** Complete. Local and Railway lifecycle, recovery, health, migration, and cost checks
passed. See [`stage-02-deployment-worker.md`](stage-reports/stage-02-deployment-worker.md).

### Outcome

The highest-risk topology assumption is verified before feature implementation.

### Work

- Add a multi-stage Containerfile and Railway configuration.
- Provision one Railway application service and one managed PostgreSQL service.
- Start pg-boss with one temporary diagnostic job handler.
- Add `/health/ready` with bounded configuration and database checks.
- Verify graceful shutdown stops job intake before database disconnection.
- Verify a job survives process termination and completes once after restart.
- Record measured idle cost and current provider pricing in deployment documentation.
- Keep the diagnostic job private and remove it when Stage 4 replaces it with synchronization work.

### Exit gate

- HTTPS, liveness, readiness, migration execution, and structured logs work in Railway.
- Restart recovery is reproducible without a lost job or duplicate logical effect.
- Projected recurring cost remains below the USD 25 planning ceiling.
- If same-process execution fails, explicitly approve the documented second-service fallback before
  continuing.

## Stage 3: Contracts, schema, and workspace isolation

**Status:** Complete. Contracts, prefixed schema, state transitions, workspace cookies, isolation,
and bounded cleanup are implemented and tested. See
[`stage-03-contracts-schema-isolation.md`](stage-reports/stage-03-contracts-schema-isolation.md).

### Outcome

The system has explicit state transitions and an isolated public-demo security boundary.

### Work

- Define contracts for simulated source input, mapped customer output, job payloads, and safe
  errors.
- Define bounded states for source events, synchronization runs, and attempts.
- Add `p1_`-prefixed tables and columns for workspaces, source events, runs, attempts, and audits.
- Add foreign keys, unique idempotency constraints, checks, indexes, and expiration timestamps.
- Issue opaque workspace tokens in secure, HTTP-only, same-site cookies and store only token hashes.
- Scope every query and mutation by the authenticated workspace.
- Add bounded cleanup for expired synthetic workspaces.
- Document schema ownership, error codes, retention, payload limits, and state transitions.

### Exit gate

- Migration tests pass against PostgreSQL from an empty database.
- Valid state transitions succeed; invalid transitions and oversized payloads fail safely.
- Duplicate events cannot create duplicate logical runs.
- A missing, malformed, expired, or cross-workspace token is denied.
- Cleanup cannot delete active or unrelated workspaces.

## Stage 4: Simulated synchronization vertical slice

**Status:** Complete. The simulator flow, atomic queue insertion, CRM effect persistence, scoped
APIs, interruption recovery, local/browser checks, hosted CI, and Railway verification passed. See
[`stage-04-simulated-synchronization.md`](stage-reports/stage-04-simulated-synchronization.md).

### Outcome

One customer update completes through the real application and worker path.

### Work

- Implement deterministic commerce-source and CRM-destination simulators.
- Validate and persist one source event before enqueueing work.
- Map the accepted source fields to the destination contract with pure functions.
- Process the job through pg-boss and persist each attempt and final run state.
- Apply an idempotency key at both event intake and destination-effect boundaries.
- Add server endpoints for event creation, run listing, and run detail.
- Emit correlation IDs and safe structured logs throughout the flow.

### Exit gate

- A valid event moves from accepted to queued to succeeded.
- Invalid input has no external effect and returns stable field-level errors.
- Repeated delivery produces one logical destination effect.
- Process interruption leaves durable recoverable work.
- All queue, payload, and processing limits have boundary tests.

## Stage 5: Operational user interface

**Status:** Complete. The five-view UI, bounded polling, accessibility review, local and hosted
browser flows, CI, and Railway deployment checks passed. See
[`stage-05-operational-ui.md`](stage-reports/stage-05-operational-ui.md).

### Outcome

A portfolio visitor can understand and operate the successful flow on mobile and desktop.

### Screens

1. Public introduction and demo entry.
2. Overview with recent status and concise totals.
3. Synchronization runs with bounded filtering.
4. Run detail with source, mapping, attempts, and timeline.
5. Demo controls for creating safe simulated events and starting a fresh workspace.

A fresh workspace replaces this browser's session; it does not delete old data. Audited destructive
reset remains in Stage 6, avoiding two overlapping implementations.

The connection state may be a panel rather than a sixth screen because public providers are
simulated and cannot be reconfigured.

### Work

- Establish visual tokens and native accessible controls. Add shadcn/ui only when a current widget
  requires behavior not supplied by native controls.
- Implement responsive navigation and layouts.
- Add explicit loading, empty, stale, success, and invalid-input states.
- Poll only active run details and stop polling at a bounded time or terminal state.
- Keep raw tokens, provider responses, and sensitive payload fields out of rendered data.

### Exit gate

- The complete success flow works without credentials or instructions.
- Keyboard navigation, focus visibility, labels, and contrast pass an accessibility review.
- Representative mobile and desktop Playwright checks pass.
- Empty and loading states are intentional rather than blank or shifting layouts.

## Stage 6: Failure, retry, and recovery flow

### Outcome

The difficult operational behavior is visible, bounded, and safe to exercise.

### Work

- Add deterministic simulator controls for rate limit, temporary outage, and invalid destination
  data.
- Classify failures as retryable or terminal without exposing raw provider responses.
- Add explicit retry count and delay limits with visible next-attempt timestamps.
- Add a workspace-scoped manual retry action and audit event.
- Make retry requests idempotent and reject retries for active or successful runs.
- Add terminal retry-exhaustion state and actionable UI explanations.
- Add a workspace-scoped reset that affects synthetic records only.

### Exit gate

- Temporary failures retry within fixed limits and can recover visibly.
- Terminal failures never retry automatically.
- Exhausted runs remain inspectable and do not loop.
- Unauthorized, cross-workspace, duplicate, and invalid-state retry requests are denied.
- Concurrent retry requests create at most one new active attempt.
- Reset cannot affect another workspace or any real external system.

## Stage 7: Real sandbox adapter evidence

### Outcome

The repository has truthful, reproducible evidence for one real integration path.

### Work

- Implement a narrow Stripe test-mode source adapter for the fields in the existing contract.
- Implement a narrow HubSpot developer-test destination adapter.
- Validate provider responses before they enter internal state.
- Map provider errors into the established stable error classes.
- Add an opt-in integration test requiring maintainer-owned environment secrets.
- Add bounded API timeouts, rate-limit handling, and redacted request diagnostics.
- Document sandbox setup, cleanup, limitations, and which public behavior remains simulated.

### Exit gate

- The opt-in test synchronizes one synthetic Stripe customer to HubSpot and verifies the result.
- Missing or invalid credentials fail closed without leaking secret or provider internals.
- Duplicate execution does not create duplicate HubSpot contacts.
- Rate limit, timeout, invalid response, and partial-failure paths are tested or reproduced safely.
- The public deployment has no route or configuration capable of invoking these adapters.

If sandbox access proves impractical, stop this stage and label both public endpoints as simulated.
Do not weaken credential isolation merely to preserve the real-integration claim.

## Stage 8: Public-demo hardening

### Outcome

The application is safe and stable enough for anonymous portfolio evaluation.

### Work

- Add request, event, batch, retry, and workspace creation limits.
- Add origin validation and security headers for state-changing routes.
- Verify cookie flags, token entropy, token hashing, and expiration behavior.
- Add bounded retention cleanup and safe synthetic seed/reset behavior.
- Review logs, responses, browser bundles, screenshots, and source maps for sensitive data.
- Add deterministic seed scenarios for success, retry recovery, and terminal failure.
- Run dependency and container vulnerability checks and disposition changed-scope findings.
- Test readiness failure, database outage, malformed input, and worker restart behavior.

### Exit gate

- Security and negative-path checks pass in CI or a documented release checklist.
- One visitor cannot observe or mutate another visitor's workspace.
- Public actions have bounded resource use and no real external side effects.
- Database and worker failures degrade visibly and recover without corrupt state.
- No known exploitable changed-scope finding is released without explicit disposition.

## Stage 9: Release and portfolio evidence

### Outcome

A deployed, documented, and truthfully presented portfolio project.

### Work

- Run forward-only migrations as an explicit Railway release step.
- Verify deployment from a clean environment and exercise restart recovery once more.
- Finalize README sections for architecture, setup, tests, deployment, tradeoffs, and simulation.
- Publish the public URL and verify representative mobile and desktop devices.
- Capture a small screenshot set covering success and failure recovery.
- Record a short walkthrough using deterministic seeded scenarios.
- Record measured workload, environment, method, and limitations for any performance claim.
- Compare actual monthly cost with the operating budget.

### Release gate

- Every product-brief acceptance criterion has reviewer-visible evidence or an explicit deferral.
- CI and the production smoke test pass against the release commit.
- Setup and deployment instructions have been verified where practical.
- The public description says **Independent Project** and **Product Concept**.
- Real, seeded, and simulated behavior is clearly distinguished.
- Screenshots and walkthrough match the deployed release.

## Stage dependencies

Stages are intentionally sequential:

```text
foundation
→ deployment risk
→ contracts and isolation
→ successful vertical slice
→ operational UI
→ failure and recovery
→ real sandbox evidence
→ public hardening
→ release evidence
```

A later stage may add a failing test earlier, but it must not introduce its product surface before
its prerequisites pass. Deployment verification is early because a failed worker topology would
change implementation choices; visual polish follows the working flow so screens reflect real states
rather than mock state.

## Completion boundary

Version 1 is complete when Stage 9 passes. Additional connectors, account systems, workflow
builders, analytics services, independent scaling, and infrastructure automation remain deferred
unless a measured capability, correctness, security, or deployment gap requires them.
