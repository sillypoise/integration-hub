# Stage 2 Report: Deployment and Worker Lifecycle

## Status

Complete. The same-process application and worker are deployed on Railway with shared PostgreSQL,
and the local and hosted lifecycle exit gates passed.

## Delivered

- Added pg-boss with vendor tables isolated in PostgreSQL schema `p1_job`.
- Added a bounded diagnostic queue and worker in the application process.
- Added a custom Node.js server with structured startup and graceful-shutdown logging.
- Added PostgreSQL liveness-independent readiness checks with safe `503` behavior.
- Added a production migration entry point using `p1_migrations.p1_drizzle_migrations`.
- Added a non-root multi-stage `Containerfile` and Railway configuration.
- Added Podman image lifecycle commands and a reviewer-visible Railway cost estimate.
- Recorded the `p1_` database naming contract and vendor-owned exceptions.

## Verified

- A queued diagnostic job survives worker shutdown and completes after restart.
- Invalid diagnostic payload boundaries fail before enqueueing.
- pg-boss reports no managed-schema drift after startup.
- Readiness returns a safe `503` during a local database outage and recovers after restart.
- Readiness success and safe database-failure responses pass automated tests.
- Direct `SIGTERM` stops job intake and logs completed shutdown.
- The production OCI image builds, starts as a non-root user, and passes liveness and database
  readiness checks in hosted CI.
- GitHub Actions run
  [`33922171359`](https://github.com/sillypoise/integration-hub/actions/runs/33922171359) passed
  formatting, linting, typechecking, migrations, unit and browser tests, and the container smoke
  test.

- Railway deployment `2fb54cab-9c55-499e-aa99-fe8ef0d43839` passed its pre-deploy migration and
  `/health/ready` gate.
- Public HTTPS liveness and readiness pass at
  <https://p1-integration-hub-production.up.railway.app>.
- Delayed job `55816ebe-4f19-4eb6-8b4e-f18a893e7a31` survived a Railway service redeploy, reached
  `completed` with no retry, and produced exactly one completion log event.
- Hosted PostgreSQL contains the prefixed `p1_migrations.p1_drizzle_migrations` table and pg-boss
  tables only within `p1_job`.
- A two-minute idle sample measured about 0.199 GB memory and 0.0052 vCPU combined. The projected
  resource usage is about USD 2.24 per month and fits within the USD 5 Hobby charge.

Local image pulling previously timed out during registry TLS negotiation. Hosted CI provided the
reviewer-visible image build and runtime check instead.

## Follow-up

- Recheck measured Railway usage after seven days.
- Replace and remove the temporary diagnostic queue when the Stage 4 synchronization worker lands.
