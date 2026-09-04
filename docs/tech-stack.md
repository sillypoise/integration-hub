# Integration Hub Technology Stack

## Decision

- Owner: Repository maintainer.
- Status: Accepted for the initial implementation.
- Confidence: Medium-high. Every component supports a current product requirement; deployment and
  monthly cost still require validation with a thin production spike.
- Revisit when: Railway cannot keep the worker lifecycle reliable within budget, PostgreSQL queue
  contention is measured, or a real integration requires capabilities this topology cannot provide.

Package versions will be pinned in `package.json` and the lockfile when the application is
scaffolded. We will select current stable releases that support Node.js 22 rather than recording
unverified version numbers here.

## Application

- Runtime: Node.js 22 LTS for portfolio alignment and a defined support lifecycle.
- Language: TypeScript with strict compiler settings across UI, API, and worker.
- Package manager: pnpm with a committed lockfile for deterministic installs.
- Command runner: Just as the single developer and CI entry point for project commands.
- Web framework: Next.js App Router for visible Next.js evidence in one application.
- UI: React, Tailwind CSS, and selected shadcn/ui components for polished delivery.
- Validation: Zod for untrusted HTTP, form, and adapter data.
- Forms: Native React and HTML primitives; current forms do not need another library.
- Server state: Server Components plus narrow polling; no client cache framework yet.

Copied shadcn/ui component source remains application-owned. Components will be added only when a
current screen needs them.

## Data and background work

- Database: PostgreSQL 17 as the durable source of truth.
- Database access: Drizzle ORM and `node-postgres` for typed schema, migrations, and SQL access.
- Job queue: pg-boss on the application database for durable jobs without Redis.
- Worker: pg-boss in the same Node deployment, sufficient for portfolio traffic.
- Identifiers: Database-generated UUIDs for non-sequential public identifiers.
- Time: UTC in PostgreSQL and ISO 8601 at HTTP boundaries.

The source event, synchronization run, attempt, demo workspace, and audit event are durable database
records. Derived dashboard totals will be queried rather than stored until measurements prove that
materialization is needed.

The web and worker share one process for the initial deployment. Startup must register each handler
once, graceful shutdown must stop intake before database disconnect, and jobs must remain durable
across process termination. pg-boss provides job claiming across replicas if the host restarts or a
second replica is introduced; correctness must not depend on having exactly one process.

## Integration boundary

- The public source and destination are deterministic in-process simulators behind explicit adapter
  interfaces.
- The first real path is Stripe test mode input to a HubSpot developer test account destination.
- Real credentials are available only to a maintainer-run integration test or private environment.
- Public runtime configuration cannot enable real outbound adapter calls.
- HTTP contracts use JSON and stable application error codes; raw provider errors remain internal.

Only the two adapters create an interface boundary. We will not build a connector SDK, plugin
system, field-mapping language, or dynamic code-loading mechanism.

## Testing and quality

- Static: TypeScript, Oxlint, and Oxfmt with warnings treated as failures. TypeScript checks
  application code strictly while `skipLibCheck` isolates incompatible Next.js and Vitest
  declarations. Re-test that exception whenever either dependency is upgraded.
- Unit: Vitest for validation, mapping, idempotency, and retry classification.
- Database integration: Vitest against PostgreSQL in Podman for persistence behavior.
- Browser: Playwright for the primary flow, responsive boundaries, denial, and recovery.
- Real adapter: An opt-in Vitest test with maintainer secrets for the sandbox flow.

CI will invoke `just ci` to run formatting, lint, typecheck, unit tests, database migrations, build,
and a focused browser smoke test. Tests must cover valid, invalid, duplicate, unauthorized, retry
boundary, retry exhaustion, and interrupted-worker paths.

## Security model

- Public visitors use an opaque, cryptographically random workspace token in a secure, HTTP-only,
  same-site cookie.
- Only a token hash is stored. Every read, mutation, retry, and reset is scoped by workspace ID.
- Workspaces and their synthetic records expire through a bounded cleanup job.
- State-changing HTTP requests validate origin and use same-site cookie protections.
- The application applies explicit request body, event count, retry count, and batch-size limits.
- Secrets are injected as deployment environment variables and validated once at startup.
- Logs contain correlation IDs, stable error codes, and timing, but no tokens, secrets, or raw
  customer payloads.
- Maintainer-only real integration tests run outside the public application and fail closed when
  required secrets are absent.

We will not add user accounts or an authorization provider initially. Workspace possession grants
access only to synthetic records in that workspace; real integration authority is never available
through the public application.

## Observability

- Structured JSON application logs using Pino.
- Correlation IDs connect source events, jobs, attempts, and safe error responses.
- Durable audit rows record retry and reset decisions.
- `/health/live` reports process liveness without dependency checks.
- `/health/ready` verifies required configuration and database connectivity with a strict timeout.
- The UI derives operational status from persisted runs and attempts.

A hosted error-tracking or metrics vendor is deferred until the deployment shows a current need.
Railway logs and database-visible job state are sufficient for the initial public demo.

## Deployment

- Source control and CI: GitHub and GitHub Actions.
- Application host: Railway.
- Database host: Railway managed PostgreSQL.
- Build artifact: Multi-stage OCI image built from a Containerfile with Podman.
- Deployment shape: One Node application service and one PostgreSQL service.
- Environments: Local, CI, and public demo; private sandbox tests run on demand.
- Schema changes: Forward-only Drizzle migrations run as an explicit release step.
- TLS: Railway-managed HTTPS and an encrypted provider network connection to PostgreSQL.

The first deployment spike must verify persistent worker startup, graceful shutdown, migration
execution, TLS database configuration, readiness behavior, restart recovery, and current monthly
pricing. If a reliable one-service worker is not possible, the narrow fallback is a second Railway
service using the same image with a worker command. That adds compute cost and is not admitted until
the spike demonstrates the need.

## Explicit exclusions

The initial implementation will not use:

- Redis, Kafka, SQS, or a separate queue service.
- Serverless functions for background jobs.
- Kubernetes, Terraform, or multiple cloud providers.
- GraphQL, tRPC, a generic repository layer, or a service mesh.
- A monorepo, shared package, connector SDK, or plugin architecture.
- User registration, billing, teams, or production OAuth connection management.
- Analytics, hosted telemetry, or feature-flag services.

## Alternatives considered

### Vercel plus managed PostgreSQL and a hosted job platform

This is convenient for Next.js, but introduces a third runtime boundary and makes job behavior less
visible. It is deferred because the project specifically needs to demonstrate Node.js background
processing, not outsource it.

### Redis-backed queue

BullMQ is mature, but Redis adds another service, connection lifecycle, and cost. PostgreSQL queue
throughput is sufficient for the stated maximum of 1,000 simulated events per day. Reconsider only
if measured queue contention or latency violates acceptance criteria.

### Separate web and worker services

This gives independent scaling and cleaner process ownership, but doubles deployment topology for a
portfolio workload. It is the documented fallback if lifecycle testing disproves the single-service
assumption.
