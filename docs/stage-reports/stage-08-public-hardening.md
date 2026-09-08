# Stage 8: Public-demo hardening

## Status

Complete, independently of the still-unimplemented Stage 7 Stripe source adapter. Public
integrations remain explicitly simulated. No real-adapter completion or general security guarantee
is claimed.

- Release commit: `6cf7a77`.
- Railway deployment: `405e947e-2b25-4f66-9b67-e6ce77b2d426`.
- [Passing CI 34285122039](https://github.com/sillypoise/integration-hub/actions/runs/34285122039).
- Public origin: <https://p1-integration-hub-production.up.railway.app>.

## Delivered

- Fixed-cardinality HTTP admission, concurrency, connection, header, URL, and timeout bounds; no IP
  tracking or forwarded-header authority.
- Transactional global admission budgets and a reset-resistant workspace lifetime event cap,
  including rollback, replay, expiry, exhaustion, and missing-budget denial checks.
- Fresh CSP nonces, dynamic rendering, security headers, disabled source maps/image optimization,
  and explicit rate/budget UI errors. Runtime packaging includes `next.config.ts`.
- Dependency/bundle/image audit gates, retained image reports, and a patched development-only
  esbuild dependency. No vulnerability ignore rules or relaxed severity gate.
- A digest-pinned Alpine runtime containing the pinned Node binary but no inherited Node package
  managers. A container-only launch check rejects unexpected UID or available Node package tools
  before importing the application.

## Verification

- Final CI passed 195 unit/integration tests, 34 desktop/mobile browser checks, strict formatting,
  lint/types, build, dependency audit, and production-container smoke. Configured coverage was
  99.48% statements / 98.57% branches, not whole-application or React coverage.
- Container smoke verified Node 22.23.2, UID 10001, absent global Node tooling, release migrations,
  readiness, and `404` for the disabled image optimizer. Eleven entry-point tests exercise valid
  launch, three invalid UIDs, and all seven forbidden tool paths without starting the server.
- Public-bundle inspection checked 1,026,188 JavaScript bytes: no checked server-only markers or
  public source maps. Dependency and image audits reported no known vulnerabilities.
- The retained CI image report contains 18 OS and 76 application package entries, with zero findings
  at all severities. Report SHA-256:
  `65d5d15dc095a0250e489881a889d3dd073b42321659c3907c78698317af06d7`.
- Final Railway startup emitted `Container runtime verified.` before accepting traffic. Read-only
  inspection confirmed main-process UID 10001, no global npm/Corepack/Yarn, no provider credential
  variables, and package versions matching the final CI inventory. Railway rebuilds the image; this
  is package/version evidence, not byte-identical artifact attestation.
- Ten selected checks passed again on the final public release using Desktop Chrome and Pixel 7:
  mapping/replay, automatic recovery, exhaustion/manual restoration, terminal failure, scoped
  denial/reset, responsive layout, hydration, and actual parser-injected-script rejection.
- Separate public probes confirmed `200` health, `401` unauthorized overview, `414` oversized URL,
  `431` oversized headers, and `404` image optimization. Application responses had expected HSTS,
  nosniff, no-store where required, and no framework-identification header.
- Six migrations and two retained budget rows were verified. After the hosted checks, counters were
  16 accepted events / 24 workspaces across releases; audits retained 16 acceptances, 4 retries, 8
  reset records, and 24 creations. Shared production quotas were not exhausted to test rejection;
  those paths were tested against disposable databases and controlled HTTP guards.
- The local database-pause drill preserved live `200`, returned ready/overview `503`, and recovered
  run `930d0de1-83a8-484f-8ff3-3d7be5bf29ae` on attempt two. PostgreSQL was unpaused afterward.
  Existing real SIGKILL/restart tests passed. The local container host-alias connection refusal was
  not counted as passing startup evidence; hosted container and release checks supply that evidence.

## Findings and controlled rollout

- [CI 34257152565](https://github.com/sillypoise/integration-hub/actions/runs/34257152565) exposed
  an unsupported OCI-tar scanner input. Podman now exports Docker-format archives and clears its
  owned previous archive/report before repeat exports. Scanner failures were not called clean scans.
- [CI 34257862889](https://github.com/sillypoise/integration-hub/actions/runs/34257862889) found
  Debian package advisories (4 critical / 52 high / 88 medium / 72 low / 5 unknown entries) and
  bundled npm advisories (1 critical / 10 high / 7 medium / 1 low). These were package/advisory
  entries, not distinct proven remote exploits. Replacing that runtime surface removed the findings.
- The first Alpine candidate passed
  [CI 34280208513](https://github.com/sillypoise/integration-hub/actions/runs/34280208513). Stage 6
  was confirmed removed before Stage 8 deployment `6352271e-5d13-47b5-a20e-fc21bbfc4b28`. Public
  checks passed, but hosted inspection exposed global tooling absent from CI.
- Adding application-context checks passed
  [CI 34283736847](https://github.com/sillypoise/integration-hub/actions/runs/34283736847), but
  replacement `0ba12280-96ff-4e40-a0f1-24bad567d5ae` correctly failed its launch boundary. The
  previous deployment continued serving. The final image never inherits Node package managers, and
  both its hosted launch check and subsequent inventory inspection passed. The earlier Railway
  image/runtime discrepancy's underlying cause remains unexplained; do not remove the gate.

## Limits and follow-up

The [security contract](../security.md) records bounds, estimates, compatibility, and tradeoffs.
Shared quotas are not fairness or DDoS guarantees; fixed-window boundaries permit short bursts. HTTP
counters are per-process; durable budgets span restarts and replicas. Reset cannot replenish
lifetime admissions. Old quota-unaware intake must not return after activation; fix forward.

Confidence: high for the recorded checks, not proof of absence of vulnerabilities. The maintainer
must repeat image/runtime verification on future image changes and review operating costs in
Stage 9. Repository-wide assertion density remains unmeasured; no aggregate TigerStyle compliance is
claimed.

Guide trace: `SAF-02/11` bounded work and negative tests; `SECCORE-BOUND-003/AUTH-002` fail-closed
scoped operations; `SIMPLE-ADMIT-003` reuse; `CONTRACT-CHG-001/002` contract and boundary review;
`EPI-CLAIM-001/002` separate observed hosted evidence from assumptions and unresolved causes.
