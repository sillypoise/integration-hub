# ADR 0001: Shared Portfolio Database Naming

## Status

Accepted.

## Context

The intentionally non-production portfolio projects may share one PostgreSQL database. Objects need
visible project ownership without introducing one database service per demo.

## Decision

Integration Hub-owned tables, columns, indexes, and constraints use the `p1_` prefix. Drizzle and
pg-boss internals cannot safely rename every vendor-owned column, so those objects are isolated in
schemas `p1_migrations` and `p1_job`.

## Consequences

- Sibling projects can use separate prefixes in the same database.
- Domain SQL is more verbose but ownership is obvious during inspection.
- Shared infrastructure is not evidence of production-grade tenant isolation.
- Vendor migrations remain upgradeable without local forks.

## Alternative considered

A PostgreSQL schema alone would be cleaner and would avoid repetitive column prefixes. It was not
selected because the repository owner explicitly wants project identity visible on owned tables and
fields when browsing the shared database.
