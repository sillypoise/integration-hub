# Integration Hub

Integration Hub is an independent portfolio product concept for monitoring and recovering a narrow,
business-critical synchronization between a commerce system and a CRM.

The project is intentionally shallow in breadth and complete in depth. It will demonstrate one real
vertical flow, polished operational visibility, deterministic failure handling, and a deployable
public demo without pretending to be a general-purpose integration platform.

## Status

Planning. The product boundary and acceptance criteria are documented in
[`docs/product-brief.md`](docs/product-brief.md). The accepted implementation and deployment choices
are documented in [`docs/tech-stack.md`](docs/tech-stack.md). Work is ordered by the gated
[`docs/implementation-plan.md`](docs/implementation-plan.md).

## Local development

Prerequisites:

- Node.js 22.23.2 and pnpm 10.33.2.
- Podman 5 or newer.

```bash
corepack enable pnpm
pnpm install --frozen-lockfile
cp .env.example .env.local
podman volume create integration_hub_postgres_data
podman run --detach --replace --name integration-hub-postgres \
    --health-cmd 'pg_isready -U integration_hub -d integration_hub' \
    --health-interval 2s --health-timeout 3s --health-retries 15 \
    --env POSTGRES_DB=integration_hub \
    --env POSTGRES_PASSWORD=integration_hub \
    --env POSTGRES_USER=integration_hub \
    --publish 127.0.0.1:5432:5432 \
    --volume integration_hub_postgres_data:/var/lib/postgresql/data:Z \
    docker.io/library/postgres:17.11-alpine3.23
podman wait --condition healthy integration-hub-postgres
pnpm db:migrate
pnpm dev
```

The application is available at `http://localhost:3000`. Stop the database with
`podman stop --time 10 integration-hub-postgres`. Remove its named volume separately only when local
data should be deleted.

Run the automated checks with:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:coverage
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

## Portfolio positioning

This is an **Independent Project** and **Product Concept**, not client work or a production-proven
business. The public demo will clearly identify simulated systems, seeded data, and measured
behavior.
