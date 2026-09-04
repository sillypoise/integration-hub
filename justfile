set dotenv-filename := ".env.local"
set dotenv-load := true
set shell := ["bash", "-euo", "pipefail", "-c"]

node_version := "22.23.2"
postgres_container := "integration-hub-postgres"
postgres_image := "docker.io/library/postgres:17.11-alpine3.23"
postgres_volume := "integration_hub_postgres_data"

# List the supported project commands.
default:
    @just --list

# Install exactly the dependencies recorded in the lockfile.
install:
    corepack pnpm install --frozen-lockfile

# Create the local environment file without replacing an existing file.
environment:
    @if test -f .env.local; then \
        echo ".env.local already exists; leaving it unchanged."; \
    else \
        cp .env.example .env.local; \
        echo "Created .env.local from .env.example."; \
    fi

# Prepare dependencies, local configuration, PostgreSQL, and migrations.
bootstrap: install environment database-start database-migrate

# Start the development server.
dev:
    corepack pnpm dev

# Create the production application build.
build:
    corepack pnpm build

# Format supported project files.
format:
    corepack pnpm format

# Verify formatting without changing files.
format-check:
    corepack pnpm format:check

# Run type-aware Oxlint checks with warnings denied.
lint:
    corepack pnpm lint

# Generate Next.js route types and run the TypeScript compiler.
typecheck:
    corepack pnpm typecheck

# Run unit tests without coverage enforcement.
test:
    corepack pnpm test

# Run one unit test file.
test-one test_file:
    corepack pnpm vitest run --config vitest.config.ts {{ quote(test_file) }}

# Run unit tests with configured coverage thresholds.
test-coverage:
    corepack pnpm test:coverage

# Install the pinned Playwright Chromium browser.
browser-install:
    corepack pnpm exec playwright install chromium

# Install Chromium and its operating-system packages in CI.
browser-install-ci:
    corepack pnpm exec playwright install --with-deps chromium

# Build and run browser smoke tests against the production server.
test-browser: build
    corepack pnpm test:e2e

# Generate a Drizzle migration from the current schema.
database-generate:
    corepack pnpm db:generate

# Apply pending Drizzle migrations.
database-migrate:
    corepack pnpm db:migrate

# Start local PostgreSQL in Podman and wait at most 45 seconds for health.
database-start:
    podman volume create --ignore {{postgres_volume}} >/dev/null
    podman run --detach --replace --pull=missing \
        --name {{postgres_container}} \
        --health-cmd 'pg_isready -U integration_hub -d integration_hub' \
        --health-interval 2s \
        --health-timeout 3s \
        --health-retries 15 \
        --health-start-period 5s \
        --env POSTGRES_DB=integration_hub \
        --env POSTGRES_PASSWORD=integration_hub \
        --env POSTGRES_USER=integration_hub \
        --publish 127.0.0.1:5432:5432 \
        --volume {{postgres_volume}}:/var/lib/postgresql/data:Z \
        {{postgres_image}} >/dev/null
    timeout 45s podman wait --condition healthy {{postgres_container}} >/dev/null
    podman healthcheck run {{postgres_container}} >/dev/null

# Stop local PostgreSQL with a bounded grace period.
database-stop:
    podman stop --time 10 {{postgres_container}} >/dev/null

# Show local PostgreSQL container state and health.
database-status:
    podman ps --all --filter name={{postgres_container}}

# Run all checks required before a commit or CI completion.
validate: format-check lint typecheck test-coverage database-migrate test-browser

# Install the browser and run the complete GitHub Actions validation entry point.
ci: browser-install-ci validate

# Print the runtime version expected by this repository.
runtime:
    @echo "Node.js {{node_version}}"
    @echo "pnpm $(corepack pnpm --version)"
    @just --version
    @podman --version
