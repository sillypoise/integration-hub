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

Repo-local `AGENTS.md` supplements the guide system with repository-specific context.
It does not define the canonical active guide set.

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

If a rule should apply across multiple repositories, promote it into the guide package instead of only documenting it here.
<!-- END MANAGED GUIDE HEADER -->

## Repo-Specific Context

<!-- BEGIN REPO CONTEXT -->
- Purpose:
- Primary languages:
- Key directories:
- Architectural constraints:
<!-- END REPO CONTEXT -->

## Build / Test / Validation

- Install:
- Build:
- Test:
- Lint:
- Typecheck:
- Validation:
- Run one test:

## Local Workflow Notes

- Preferred commands:
- Safe-to-edit areas:
- Areas requiring extra care:
- Review expectations:

## Repository-Specific Constraints

- Compatibility expectations:
- Migration / rollout constraints:
- Performance constraints:
- Security / privacy constraints:
