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
- Initial local image builds were blocked by registry TLS handshakes. Registry access subsequently
  worked. The reduced Alpine candidate built and its all-severity Trivy scan reported zero
  vulnerabilities without ignore rules. Local container startup encountered `ECONNREFUSED` to the
  loopback-only PostgreSQL service through Podman's host alias; this is not a passing startup check.
  Hosted smoke/migration checks remain required.

## Hosted image review in progress

- [CI 34257152565](https://github.com/sillypoise/integration-hub/actions/runs/34257152565) passed
  application checks and container smoke, but Trivy rejected the OCI tar input. The export was
  corrected to Docker archive format; this failed scan was not counted as vulnerability evidence.
- [CI 34257862889](https://github.com/sillypoise/integration-hub/actions/runs/34257862889) retained
  the first completed all-severity report: Debian packages had 4 critical, 52 high, 88 medium, 72
  low, and 5 unknown entries; bundled npm had 1 critical, 10 high, 7 medium, and 1 low entry. These
  are package/advisory entries, not distinct remotely exploitable defects. Application dependencies
  had no findings. The release gate correctly failed; production was not changed.
- Disposition: replace the unused Debian tooling surface with the digest-pinned official Node Alpine
  base and current OS security updates; remove runtime npm/Corepack/Yarn. Do not suppress findings
  or relax the high/critical gate. Build/runtime ABI and UID/GID remain explicit. Also include
  `next.config.ts` in the runtime image. See [runtime rationale](../security.md).
- [CI 34280208513](https://github.com/sillypoise/integration-hub/actions/runs/34280208513) passed
  all checks, including UID/version/package-tool assertions, release migrations, disabled image
  optimization, and an all-severity scan with zero findings. Report SHA-256:
  `62112a89c2a4565b3bc483e78fffe6eb3bf4652054a4fb877a40fc103a895871`.
- Stage 6 was confirmed removed before deployment `6352271e-5d13-47b5-a20e-fc21bbfc4b28` became
  healthy. Ten selected hosted desktop/mobile checks passed: mapping/replay, exhaustion and manual
  restoration, automatic third-attempt recovery, terminal failure and foreign-workspace denial,
  reset isolation, hydration, and parser-injected-script rejection. Separate probes confirmed `200`
  health, `401` overview, `414` oversized URL, `404` image optimizer, HSTS, no-store, and absent
  framework identification headers.
- Read-only inspection confirmed six migrations, budget counts of 8 events / 12 workspaces, and
  retained acceptance/retry/reset audits. Eighteen OS and 76 application package versions matched
  the CI inventory. No provider credential variables were present. The main process reported UID
  10001, whereas the SSH inspection process used UID 0 and exposed extra global npm/Corepack
  tooling. This discrepancy is not assumed harmless or counted as a complete runtime inventory.
- A container-only startup check now rejects unexpected UID/package-tool availability before
  starting the application. Eleven focused tests cover valid launch, unexpected UIDs, and all seven
  forbidden tool paths. Its hosted verification and final release review remain pending.

- [CI 34283736847](https://github.com/sillypoise/integration-hub/actions/runs/34283736847) passed
  195 tests and all other gates with zero scan findings. Its 94 package/version entries matched the
  preceding CI report. However, deployment `0ba12280-96ff-4e40-a0f1-24bad567d5ae` failed the new
  application-context runtime check and did not become healthy. The preceding Stage 8 deployment
  continued serving `200` readiness. No complete-runtime or completed-stage claim is made from the
  passing CI result alone.
- Follow-up: use a plain, digest-pinned Alpine runtime containing only the copied Node binary and
  required OS libraries, rather than deleting inherited Node package managers. This avoids relying
  on removal of inherited tooling; the underlying Railway discrepancy is not yet explained. Failure
  logs now distinguish UID validity from Node-tool availability using bounded booleans. Repeated
  local image audits also remove their owned prior archive/report before export, because Podman
  rejects overwriting Docker-format archives.

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
