# Public-demo security and resource contract

Owner: repository maintainer. Stage 8 hardens the existing simulated flow; no real adapter is
introduced. Stripe access is restored, but its source adapter remains unimplemented; HubSpot is
deferred as recorded in the Stage 7 report.

## Admission limits

| Boundary                         | Limit                    | Scope / rejection                                       |
| -------------------------------- | ------------------------ | ------------------------------------------------------- |
| Normal HTTP requests             | 1,200 per fixed minute   | Per process, `429 REQUEST_LIMIT_REACHED`.               |
| Mutating requests (not GET/HEAD) | 120 per fixed minute     | Per process; included in the normal budget.             |
| Workspace creation requests      | 20 per fixed minute      | Per process; also consume the first two budgets.        |
| Health requests                  | 120 per fixed minute     | Separate per-process budget.                            |
| Normal active handlers           | 16                       | Excess gets `503 DEPENDENCY_UNAVAILABLE`.               |
| Active health handlers           | 2                        | Separate capacity; excess gets `503`.                   |
| Open HTTP connections            | 128                      | Node refuses excess connections.                        |
| Headers / request URL            | 8 KiB / 2,048 characters | Node `431` / application `414 INVALID_INPUT`.           |
| Header / request-body deadline   | 5 / 10 seconds           | Node HTTP deadlines, checked every second.              |
| Keep-alive / requests per socket | 5 seconds / 100          | Bounded connection lifetime and reuse.                  |
| Successful workspace creations   | 200 per 24-hour window   | Durable global budget, `429 DEMO_BUDGET_REACHED`.       |
| Accepted new events              | 2,000 per 24-hour window | Durable global budget, same `429`.                      |
| Events per workspace lifetime    | 1,000                    | `409 EVENT_LIMIT_REACHED`; reset does not replenish it. |

Limits are fixed windows, not sliding-window promises: a short interval across a window boundary can
admit up to twice a window's allowance. HTTP counters reset on process restart and multiply with
replicas. Two fixed PostgreSQL budget rows persist across restarts/replicas; their updates commit
atomically with successful creation/intake. Replays of retained events consume no new event budget.
Rejected inputs, failed enqueue transactions, retries, and resets do not consume new event
admissions. Migration 0005 initializes budgets from recent existing admissions.

HTTP rejections close the connection and return `Retry-After: 60`. Daily admission denials use
`Retry-After: 86400`, a conservative upper wait, not an exact reset time. Early HTTP limits can
precede authentication/origin checks; they disclose no protected resource information. Per-process
admission warnings are sampled once per minute to avoid turning rejected traffic into log growth.
Other action/authorization decisions retain safe structured logging and transaction audit rows.

No forwarded IP header grants authority or selects a rate-limit bucket. No IP address is stored.
Four fixed counters avoid attacker-controlled bucket cardinality. This chooses bounded resource use
over visitor fairness: one abusive visitor can exhaust a shared budget. These application controls
are not network-level DDoS protection or an uptime guarantee.

## Existing bounds retained

- 500 active workspaces, 24-hour expiry, and hourly cleanup of at most 100 expired workspaces.
- Three automatic attempts and one manual restoration; delayed jobs remain identifier-only.
- One worker/batch; three infrastructure executions per job, 30-second leases and bounded delays.
- Three confirmed, idempotent resets per workspace; audits survive reset and expire with workspace.
- 16 KiB JSON body / five-second stream deadline; strict synthetic inputs, no real identities.
- Twenty rows/page, fifty pages, six recent summaries, four attempts and one effect per detail.
- At most thirty detail requests / sixty seconds per refresh; no overlapping polling.

Lifetime intake counts reuse acceptance audits instead of new derived counter state. Retained source
count is also checked. Reset removes synthetic records but neither acceptance history nor global
budget rows. One workspace therefore admits at most 4,000 jobs and roughly 2,004 audit rows in its
life. Across a boundary, two daily event windows admit at most 4,000 events / 16,000 jobs; at an
illustrative 1 KiB per job before indexes/WAL, that is about 16 MiB, not the previous
reset-amplified multi-GiB planning bound. This is a resource sketch, not a measured capacity or
billing result. The USD 25 monthly planning ceiling remains unchanged.

## Browser and credential boundary

A new 256-bit CSP nonce is generated for every response and overwrites any client-supplied CSP or
nonce header. Root rendering waits for a connection so Next can nonce framework and hydration
scripts. Production script policy permits nonced scripts and their trusted descendants, not
`unsafe-inline` or `unsafe-eval` scripts. Styles permit inline CSS for framework/native rendering;
this is not permission to execute inline JavaScript. Development alone permits eval and local
WebSocket tooling. Dynamic rendering is the explicit tradeoff for per-response script nonces.

Responses include nosniff, DENY framing, no-referrer, same-origin opener/resource policies, disabled
camera/microphone/geolocation/payment, and a CSP restricting objects, base URLs, forms, connections,
images, and fonts. HTTPS origins receive one-year HSTS without claiming authority over subdomains.
Public source maps and unused image optimization are disabled. `just bundle-audit` checks built
public assets for server-only markers and source maps. Browser tests also exercise CSP enforcement
against parser-injected script HTML; DevTools evaluation is not a valid CSP attack model.

Workspace cookies remain opaque, host-only, HTTP-only, SameSite Strict, Secure on HTTPS, and expire
in 24 hours. Only hashes are stored. Mutation authorization remains workspace/action-scoped with
exact configured Origin checks. Errors and logs exclude arbitrary dependency messages/names,
credentials, raw customer payloads, and attacker-controlled request fields. No Stripe credentials or
real adapter code are shipped by this stage.

## Failure and release verification

`just validate` includes unit/database/browser checks, bundle inspection, and dependency audit.
`just container-audit` scans the already-built `integration-hub:local` image using Trivy 0.74.0,
whose upstream archive is SHA-256 verified. It retains all-severity JSON and fails on high/critical
findings. Hosted CI uploads the report for 14 days; scanner/network failure is not a clean scan. All
findings require review; exploitable changed-scope findings require correction or explicit release
disposition, even below the automated severity threshold.

`just outage-check pause-local-database` requires an existing production build and the disposable
project PostgreSQL container on loopback port 5432. It checks port 3105 is free, starts only its own
web/worker, pauses/unpauses only that database, verifies live `200` / ready `503` / overview `503`,
then verifies the delayed run recovers with two attempts and a destination effect. A 150-second
outer deadline, cleanup trap, and child shutdown bound the drill. Do not run it against a database
serving other work. The synthetic probe follows ordinary workspace expiry afterward.

## Dependency disposition

The first dependency audit found development-only `esbuild@0.18.20` via Drizzle's legacy
`@esbuild-kit/core-utils`, advisory GHSA-67mh-4wv8-2f99 (moderate, development-server response
exposure). A parent-scoped override selects patched 0.25.12, already used directly by Drizzle.
Install, migration, types, and tests verify compatibility; no esbuild server is exposed by this app.
The follow-up audit reports no known vulnerabilities. Maintainer owns the override; review at Stage
9 and remove when Drizzle no longer pulls the vulnerable transitive version. Deprecated loader
packages remain development tooling, not public runtime authority.

Image scan results and final hosted evidence are recorded in the
[Stage 8 report](stage-reports/stage-08-public-hardening.md); this document alone does not assert a
clean image scan or production-proven security.
