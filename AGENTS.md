# Repo Agent Context

<!-- BEGIN MANAGED GUIDE HEADER -->

This repository uses the pi guide system.

## Guide Activation Contract

Active guides for this repository are defined in:

- `.pi/guides.json` — canonical machine-readable guide selection
- installed pi guide package extension — resolves and injects active guides into the system prompt

The pi guide package can be made available either:

- globally from `~/.pi/agent/settings.json`, or
- repo-locally from `.pi/settings.json`

Repo-local `AGENTS.md` supplements the guide system with repository-specific context. It does not
define the canonical active guide set.

## Authoring Rules for This File

Use this file for:

- repository architecture facts
- build, test, and validation commands
- local workflow expectations
- repository-specific constraints
- durable notes that help future tasks in this repo

Do not use this file for:

- reusable cross-repo guide content
- large generic policy documents
- secrets, tokens, or credentials
- machine-readable guide selection state

If a rule should apply across multiple repositories, promote it into the guide package instead of
only documenting it here.
<!-- END MANAGED GUIDE HEADER -->

## Repo-Specific Context

<!-- BEGIN REPO CONTEXT -->

- Purpose: Portfolio demonstration of one observable commerce-to-CRM customer synchronization.
- Primary languages: TypeScript and SQL.
- Key directories: `src/app/` contains Next.js routes, `src/lib/` contains server logic, `src/db/`
  contains schema definitions, `drizzle/` contains migrations, and `docs/` contains decisions.
- Architectural constraints: Keep one Next.js application and PostgreSQL-backed job worker. Public
  integrations are deterministic simulators; real adapters remain maintainer-only.

<!-- END REPO CONTEXT -->

## Build / Test / Validation

- Install: `just install`
- Build: `just build`
- Test: `just test-coverage && just test-browser`
- Lint: `just format-check && just lint`
- Typecheck: `just typecheck`
- Validation: `just validate`
- Run one test: `just test-one path/to/file.test.ts`

## Local Workflow Notes

- Preferred commands: Use `just` recipes; package scripts are low-level implementation details.
- Safe-to-edit areas: Application source, tests, migrations, and project documentation.
- Areas requiring extra care: Workspace scoping, job idempotency, migration history, and adapters.
- Review expectations: Check valid, invalid, boundary, authorization, interruption, and retry paths.

## Repository-Specific Constraints

- Compatibility expectations: Stable HTTP errors and persisted state transitions require explicit
  contract review before changes.
- Migration / rollout constraints: Use forward-only Drizzle migrations run as an explicit release
  step; never edit an applied migration. Prefix every project-owned table and column with `p1_`.
- Performance constraints: Keep all queue, retry, batch, payload, and retention work bounded.
- Security / privacy constraints: Public actions affect only isolated synthetic workspaces. Secrets,
  raw customer payloads, and real adapter authority must not reach clients or telemetry.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your
training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's
directory; in monorepos the `next` package may not be visible from the repo root) before writing any
code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at
`node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates
the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
