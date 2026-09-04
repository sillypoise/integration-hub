# Integration Hub

Integration Hub is an independent portfolio product concept for monitoring and recovering a narrow,
business-critical synchronization between a commerce system and a CRM.

The project is intentionally shallow in breadth and complete in depth. It will demonstrate one real
vertical flow, polished operational visibility, deterministic failure handling, and a deployable
public demo without pretending to be a general-purpose integration platform.

## Status

Stage 1 is complete and Stage 2 is in progress. The product boundary is documented in
[`docs/product-brief.md`](docs/product-brief.md), the stack in
[`docs/tech-stack.md`](docs/tech-stack.md), and the delivery sequence in
[`docs/implementation-plan.md`](docs/implementation-plan.md). Completed work is summarized in
[`docs/stage-reports/`](docs/stage-reports/).

## Local development

Prerequisites:

- Node.js 22.23.2 through 24.x and pnpm 10.33.2. CI uses Node.js 22.23.2.
- Just 1.43.1.
- Podman 5 or newer.

```bash
just bootstrap
just dev
```

The application is available at `http://localhost:3000`. Stop the database with
`just database-stop`. The named volume remains intact.

Run `just` to list supported commands. Run the complete local validation with:

```bash
just validate
```

## Portfolio positioning

This is an **Independent Project** and **Product Concept**, not client work or a production-proven
business. The public demo will clearly identify simulated systems, seeded data, and measured
behavior.
