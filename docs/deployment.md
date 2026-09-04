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
railway up --service p1-integration-hub --detach
```

The `Postgres` service is the canonical shared non-production database. Other portfolio applications
reuse it with their own prefixes and vendor schemas.

Then configure the required variables, generate a public domain, and verify:

```bash
curl --fail --silent --show-error https://DEPLOYED_DOMAIN/health/live
curl --fail --silent --show-error https://DEPLOYED_DOMAIN/health/ready
```

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

Deployment `43db3146-da4d-4385-8302-261b7689a84c` passed its migration and database readiness health
check at <https://p1-integration-hub-production.up.railway.app>. Its pre-deploy command applied all
three migrations in `p1_migrations.p1_drizzle_migrations`; project tables remain in `public`, and
pg-boss creates only vendor tables in `p1_job`.

A delayed diagnostic job was queued before a service redeploy. The replacement process completed
that job with `retry_count = 0`, and hosted logs contained exactly one completion event for its
probe ID. This verifies durable recovery and one logical effect for the tested restart path.
