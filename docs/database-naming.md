# Database Naming Contract

## Decision

- Owner: Repository maintainer.
- Status: Accepted before domain schema work.
- Scope: Every database object owned by Integration Hub.

All Integration Hub-owned tables and columns must start with `p1_`. This allows the portfolio
projects to share one intentionally non-production PostgreSQL database without ambiguous object
ownership.

Examples are illustrative, not yet accepted schema:

- Table: `p1_demo_workspaces`.
- Columns: `p1_id`, `p1_created_at`, and `p1_expires_at`.
- Index: `p1_demo_workspaces_p1_expires_at_index`.
- Constraint: `p1_demo_workspaces_p1_expires_at_check`.

Drizzle migration history uses schema `p1_migrations` and table `p1_drizzle_migrations`.

Drizzle and pg-boss own their internal column names, so changing those identifiers is unsupported.
Their objects must remain isolated in the dedicated `p1_migrations` and `p1_job` schemas. These are
the only column-prefix exceptions; schema and migration-table prefixes provide ownership without
modifying vendor internals.

A future project must use a different prefix and must not query or mutate `p1_` objects directly.
This convention is isolation for a portfolio database, not a production multi-tenancy mechanism.
