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
DATABASE_SSL=disable
DATABASE_URL=${{Postgres.DATABASE_PRIVATE_URL}}
LOG_LEVEL=info
NEXT_TELEMETRY_DISABLED=1
SERVER_HOST=0.0.0.0
```

Railway injects `PORT`. `DATABASE_SSL=disable` is restricted to Railway's private service network;
an externally routed database URL must instead use `verify-full`.

The public environment must not contain Stripe or HubSpot credentials. Real adapters remain outside
the public deployment.

## Initial deployment commands

Authenticate interactively before running these commands:

```bash
railway login
railway init --name integration-hub
railway add --database postgres
railway add --service integration-hub --repo sillypoise/integration-hub
railway up --service integration-hub --detach
```

Then configure the required variables, generate a public domain, and verify:

```bash
curl --fail --silent --show-error https://DEPLOYED_DOMAIN/health/live
curl --fail --silent --show-error https://DEPLOYED_DOMAIN/health/ready
```

## Cost estimate

Confidence: Medium. This estimate uses current list prices, not measured deployment usage.

Railway's pricing page, accessed 2026-09-04, lists:

- Hobby at USD 5 per month including USD 5 of usage.
- Memory at USD 0.00000386 per GB-second, about USD 10 per GB-month.
- CPU at USD 0.00000772 per vCPU-second, about USD 20 per continuously used vCPU-month.
- Volume disk at about USD 0.15 per GB-month.
- Egress at USD 0.05 per GB.

Source: <https://railway.com/pricing>.

Estimated average usage is 0.125 GB application memory, 0.25 GB database memory, 0.02 combined vCPU,
1 GB disk, and negligible egress. That is about USD 4.30 per month and fits the Hobby charge. At 0.5
GB memory per service, the likely total is USD 11–15 per month depending on CPU. Actual usage must
be recorded after seven days. Exceeding USD 25 in a month triggers a hosting review.

## Current blocker

The local Railway CLI is installed, but `railway whoami` returns `Unauthorized`. No Railway project
or service has been created yet. Stage 2 cannot pass its deployment exit gate until authentication
is restored and the restart checks run against Railway.
