# Stage 8: Public-demo hardening

## Status

Implementation and local validation complete; hosted image review, CI, and deployment verification
remain pending. Stage 7 source-adapter implementation is still pending despite restored access; no
Stripe integration is claimed.

## Delivered

- Fixed-cardinality HTTP request, mutation, creation, health, concurrency, connection, header, URL,
  and timeout limits. No IP tracking or forwarded-header authority.
- Two durable global admission budgets and a reset-resistant workspace lifetime event limit. Atomic
  admission rollback/replay behavior and a forward-only migration preserve invariants.
- Per-response CSP script nonces, dynamic rendering, framing/referrer/permissions/resource headers,
  HTTPS HSTS, disabled public source maps, and disabled unused image optimization.
- Explicit rate/budget UI errors and safe diagnostics without arbitrary dependency error names.
- Reused deterministic success, retry recovery, and terminal-failure controls; no bulk seed API or
  second scenario framework. Existing retries, reset, cleanup, cookie isolation, and polling bounds
  remain in force.
- Pinned/checksummed Trivy tooling and CI image reports; dependency and public-bundle checks in the
  normal validation workflow. Patched the discovered development-only esbuild advisory.

## Local evidence

- `just validate` passed 184 unit/integration tests, 34 Chromium desktop/mobile checks, formatting,
  strict lint/types, production build, bundle inspection, and dependency audit.
- Server/contract coverage: 99.46% statements / 98.54% branches in the configured scope, not React
  coverage. Public bundle inspection checked 1,026,188 JavaScript bytes with no server-only markers
  or source maps. Dependency audit reports no known vulnerabilities after the scoped override.
- Browser checks verify fresh nonce headers, normal hydration/navigation, actual rejection of
  parser-injected scripts, denial responses, header/URL bounds, and readable quota errors. The
  initial DevTools-based injection was corrected because it bypassed CSP rather than modeling
  attacker-supplied HTML.
- `just outage-check pause-local-database` passed against the disposable local PostgreSQL container:
  liveness stayed `200`, readiness and overview returned safe `503` responses, and run
  `930d0de1-83a8-484f-8ff3-3d7be5bf29ae` recovered on attempt two with a destination effect.
  PostgreSQL was confirmed healthy/unpaused afterward. Existing SIGKILL/restart tests also passed.
- Local OCI build failed at registry TLS handshakes before building the image. This is not a clean
  image scan; hosted build/scan evidence is required before completion.

## Decisions and limits

[Security contract](../security.md) records exact bounds, compatibility, workload estimates, and
failure behavior. Shared quotas bound costs but do not guarantee fairness or DDoS resistance.
Fixed-window boundaries can admit twice a window's allowance in a short interval. HTTP counters are
per-process; durable accepted-work budgets span restarts/replicas. Reset cannot replenish them.

No raw customer data, credentials, or provider authority is introduced. New `429` codes are
additive; the lifetime event-limit semantics and early HTTP rejection precedence are explicit
contract changes. The schema is additive and fail-closed; old workers remain compatible, but old
intake processes must stop at cutover because they do not enforce admission budgets.

Guide trace: `SAF-02/11` bounds and negative tests; `SECCORE-BOUND-003/AUTH-002` fail-closed scoped
operations; `SIMPLE-ADMIT-003` reuse of audit/queue/scenario mechanisms; `CONTRACT-CHG-001/002`
contract delta and boundary checks; `EPI-CLAIM-001` hosted evidence required before completion.
