# Railway Deployment

## Topology

- One Railway application service built from `Containerfile`.
- One Railway managed PostgreSQL service shared intentionally with portfolio projects.
- Integration Hub-owned domain objects use the `p1_` naming contract.
- pg-boss internals are isolated in PostgreSQL schema `p1_job`.
- Drizzle history is isolated in schema `p1_migrations`.

The release command applies Drizzle migrations before Railway directs traffic to a new application
instance. `/health/live` checks only the process. `/health/ready` performs a two-second database
query and returns a bounded `503 DEPENDENCY_UNAVAILABLE` response on failure.

## Required application variables

```text
APPLICATION_ORIGIN=https://p1-integration-hub-production.up.railway.app
DATABASE_SSL=disable
DATABASE_URL=${{Postgres.DATABASE_URL}}
NEXT_TELEMETRY_DISABLED=1
NODE_ENV=production
RAILWAY_DOCKERFILE_PATH=Containerfile
SERVER_HOST=0.0.0.0
```

Railway injects `PORT`. The project token is environment-scoped, so `railway whoami` is not a valid
authentication check; project-scoped commands such as `railway status`, `railway variables`, and
`railway up` are the relevant checks. `RAILWAY_DOCKERFILE_PATH` is explicit because the initial CLI
deployment otherwise selected Railpack instead of `Containerfile`.

`DATABASE_SSL=disable` is restricted to Railway's private service network; an externally routed
database URL must instead use `verify-full`.

The public environment must not contain Stripe or HubSpot credentials. Real adapters remain outside
the public deployment.

## Initial deployment commands

Use the environment-scoped project token and confirm this repository resolves the shared portfolio
project:

```bash
RAILWAY_TOKEN=xxx railway status
```

Provision the two services only if they do not already exist, configure the required variables, and
deploy:

```bash
railway add --database postgres
railway add --service p1-integration-hub
railway variables --service p1-integration-hub --set 'DATABASE_URL=${{Postgres.DATABASE_URL}}'
just deploy
```

The `Postgres` service is the canonical shared non-production database. Other portfolio applications
reuse it with their own prefixes and vendor schemas.

Then configure the required variables, generate a public domain, and verify:

```bash
curl --fail --silent --show-error https://DEPLOYED_DOMAIN/health/live
curl --fail --silent --show-error https://DEPLOYED_DOMAIN/health/ready
```

## Stage 4 release boundary

Apply `0003_create_crm_simulator.sql` through the existing pre-deploy migration command. The new
application registers `p1_synchronization` before accepting HTTP. Existing workspaces remain valid;
there was no public event-intake route before Stage 4. Diagnostic producer/worker code is retired.
The old private `p1_diagnostic` queue was verified idle and removed through pg-boss's `deleteQueue`
API after Stage 4 became healthy; no vendor schema tables were edited.

Run tests only against a disposable development or CI database: integration checks intentionally
reset synthetic domain data and test synchronization jobs. Browser checks start `pnpm start` so the
production web and worker entry point is exercised together.

## Cost estimate

Confidence: Low for long-term usage and high that the planning ceiling is not currently at risk. The
projection combines current list prices with a short post-deployment measurement window.

Railway's pricing page, accessed 2026-09-04, lists:

- Hobby at USD 5 per month including USD 5 of usage.
- Memory at USD 0.00000386 per GB-second, about USD 10 per GB-month.
- CPU at USD 0.00000772 per vCPU-second, about USD 20 per continuously used vCPU-month.
- Volume disk at about USD 0.15 per GB-month.
- Egress at USD 0.05 per GB.

Source: <https://railway.com/pricing>.

The first two-minute idle sample averaged 0.088 GB memory and 0.0027 vCPU for the application and
0.111 GB memory and 0.0025 vCPU for PostgreSQL. Projecting those values continuously gives about USD
1.99 for memory and USD 0.10 for CPU per month. With 1 GB disk and negligible egress, estimated
resource usage is about USD 2.24 and fits within the USD 5 Hobby charge.

This short window is initial evidence, not a long-term measurement. Recheck after seven days.
Exceeding USD 25 in a month triggers a hosting review.

## Deployment evidence

Deployment `b00d5c27-5528-4376-a9de-c1f67f15feab` passed its migration and database readiness health
check at <https://p1-integration-hub-production.up.railway.app>. Hosted inspection confirms four
applied migrations and a successful simulated CRM effect; project tables remain in `public`, and
pg-boss internals remain in `p1_job`.

The Stage 4 public API probe accepted a synthetic event, converged duplicate delivery onto the same
run, and completed one successful attempt and CRM effect with zero delivery retries. Authorization,
origin, invalid-input, and cross-workspace checks passed. Evidence is recorded in the
[Stage 4 report](stage-reports/stage-04-simulated-synchronization.md).

During Stage 2, a delayed diagnostic job was queued before a service redeploy. The replacement
process completed that job with `retry_count = 0`, and hosted logs contained exactly one completion
event for its probe ID. This verifies durable recovery and one logical effect for the tested restart
path.
