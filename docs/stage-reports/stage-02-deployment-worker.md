# Stage 2 Report: Deployment and Worker Lifecycle

## Status

In progress. Local implementation and lifecycle checks are underway. Railway deployment is blocked
because the installed CLI reports `Unauthorized` for the available token.

## Delivered

- Added pg-boss with vendor tables isolated in PostgreSQL schema `p1_job`.
- Added a bounded diagnostic queue and worker in the application process.
- Added a custom Node.js server with structured startup and graceful-shutdown logging.
- Added PostgreSQL liveness-independent readiness checks with safe `503` behavior.
- Added a production migration entry point using `p1_migrations.p1_drizzle_migrations`.
- Added a non-root multi-stage `Containerfile` and Railway configuration.
- Added Podman image lifecycle commands and a reviewer-visible Railway cost estimate.
- Recorded the `p1_` database naming contract and vendor-owned exceptions.

## Verified so far

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

Local image pulling previously timed out during registry TLS negotiation. Hosted CI provided the
reviewer-visible image build and runtime check instead.

## Open exit gates

- Authenticate Railway, deploy both services, and verify HTTPS health checks.
- Terminate the Railway application during queued work and verify one completion after restart.
- Record measured idle usage and projected monthly cost from Railway metrics.
