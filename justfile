set dotenv-filename := ".env.local"
set dotenv-load := true
set shell := ["bash", "-euo", "pipefail", "-c"]

postgres_container := "integration-hub-postgres"
postgres_image := "docker.io/library/postgres:17.11-alpine3.23"
postgres_volume := "integration_hub_postgres_data"

# List the supported project commands.
default:
    @just --list

# Install exactly the dependencies recorded in the lockfile.
install:
    pnpm install --frozen-lockfile

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

# Refuse to start another watcher when Linux cannot provide enough inotify instances.
_dev-inotify-check:
    @if test -r /proc/sys/fs/inotify/max_user_instances; then \
        used_instances=$( \
            { find /proc/[0-9]*/fd -lname 'anon_inode:inotify' 2>/dev/null || true; } \
            | wc -l \
        ); \
        maximum_instances=$(cat /proc/sys/fs/inotify/max_user_instances); \
        available_instances=$((maximum_instances - used_instances)); \
        if ((available_instances < 8)); then \
            printf '%s\n' \
                "Development watcher capacity is too low ($used_instances/$maximum_instances in use)." \
                'Close idle development processes or increase fs.inotify.max_user_instances.' \
                'The development server was not started.' >&2; \
            exit 1; \
        fi; \
    fi

# Start the development server after checking Linux watcher capacity.
dev: _dev-inotify-check
    pnpm dev

# Create the production application build.
build:
    pnpm build

# Build the production OCI image with Podman.
container-build:
    podman build --pull=missing --file Containerfile --tag integration-hub:local .

# Run the production image against local PostgreSQL.
container-start:
    database_url='postgresql://integration_hub:integration_hub@'\
        'host.containers.internal:5432/integration_hub'; \
    podman run --detach --replace --name integration-hub-application \
        --health-cmd "node -e \"fetch('http://127.0.0.1:3000/health/live')\
            .then(response => process.exit(response.ok ? 0 : 1))\"" \
        --health-interval 2s \
        --health-timeout 3s \
        --health-retries 15 \
        --health-start-period 5s \
        --env APPLICATION_ORIGIN=http://127.0.0.1:3000 \
        --env DATABASE_SSL=disable \
        --env DATABASE_URL="$database_url" \
        --env PORT=3000 \
        --env SERVER_HOST=0.0.0.0 \
        --publish 127.0.0.1:3000:3000 \
        integration-hub:local >/dev/null

# Check runtime identity, release migrations, readiness, and disabled image optimization.
container-smoke: container-build container-start
    @trap 'podman stop --time 15 integration-hub-application >/dev/null || true' EXIT; \
    timeout 45s podman wait --condition healthy integration-hub-application >/dev/null; \
    timeout 15s podman exec integration-hub-application node -e "\
        const assert = require('node:assert/strict');\
        assert.equal(process.version, 'v22.23.2');\
        assert.equal(process.getuid(), 10001);\
        assert.equal(require('node:fs').existsSync('/usr/local/lib/node_modules'), false);"; \
    timeout 30s podman exec integration-hub-application node src/scripts/migrate_database.ts; \
    test "$(curl --silent --show-error --max-time 5 --output /dev/null \
        --write-out '%{http_code}' http://127.0.0.1:3000/health/ready)" = "200"; \
    test "$(curl --silent --show-error --max-time 5 --output /dev/null \
        --write-out '%{http_code}' 'http://127.0.0.1:3000/_next/image?url=%2F&w=64&q=75')" = "404"

# Stop the local production application container.
container-stop:
    podman stop --time 15 integration-hub-application >/dev/null

# Format supported project files.
format:
    pnpm format

# Verify formatting without changing files.
format-check:
    pnpm format:check

# Run type-aware Oxlint checks with warnings denied.
lint:
    pnpm lint

# Audit locked production and development dependencies; fail on any advisory.
dependency-audit:
    timeout 120s pnpm audit --audit-level low

# Install the pinned vulnerability scanner from its upstream release, verifying the archive.
security-tools:
    mkdir -p .tools
    gh release download v0.74.0 --repo aquasecurity/trivy --pattern trivy_0.74.0_Linux-64bit.tar.gz --dir .tools --clobber
    printf '%s\n' '2ae6fe3ee734b7fdf11335663e18c75ea12dccc76062f09f164a3b0f8be4371a  .tools/trivy_0.74.0_Linux-64bit.tar.gz' | sha256sum --check
    tar --extract --gzip --file .tools/trivy_0.74.0_Linux-64bit.tar.gz --directory .tools trivy

# Scan the actual production image; retain a full report and deny high/critical findings.
container-audit: security-tools
    # Trivy accepts a Docker-format tar or an OCI directory, not an OCI-format tar.
    podman save --format docker-archive --output .tools/integration-hub.tar integration-hub:local
    .tools/trivy image --input .tools/integration-hub.tar --scanners vuln --timeout 5m --format json --output .tools/container-audit.json
    .tools/trivy image --input .tools/integration-hub.tar --scanners vuln --timeout 5m --severity HIGH,CRITICAL --exit-code 1

# Inspect an existing production build for server-only markers and public source maps.
bundle-audit:
    node src/scripts/check_public_bundle.ts

# Generate Next.js route types and run the TypeScript compiler.
typecheck:
    pnpm typecheck

# Run unit and PostgreSQL integration tests after applying migrations.
test: database-migrate-release
    pnpm test

# Run one test file after applying migrations.
test-one test_file: database-migrate-release
    pnpm vitest run --config vitest.config.ts {{ quote(test_file) }}

# Run unit and PostgreSQL integration tests with configured coverage thresholds.
test-coverage: database-migrate-release
    pnpm test:coverage

# Install the pinned Playwright Chromium browser.
browser-install:
    pnpm exec playwright install chromium

# Install Chromium and its operating-system packages in CI.
browser-install-ci:
    pnpm exec playwright install --with-deps chromium

# Build and run browser smoke tests against the production server.
test-browser: build test-browser-built

# Run browser tests against an existing build so CI can time build and tests separately.
test-browser-built:
    pnpm test:e2e

# Generate a Drizzle migration from the current schema.
database-generate:
    pnpm db:generate

# Apply pending Drizzle migrations with the development CLI.
database-migrate:
    pnpm db:migrate

# Apply migrations through the production release entry point.
database-migrate-release:
    NODE_ENV=production pnpm db:migrate:release

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

# Run a bounded outage/recovery drill against the existing build and disposable project database.
outage-check confirmation:
    @test {{ quote(confirmation) }} = pause-local-database
    @trap 'podman unpause {{postgres_container}} >/dev/null 2>&1 || true' EXIT; \
        NODE_ENV=production timeout 150s node src/scripts/check_local_outage.ts

# Stop local PostgreSQL with a bounded grace period.
database-stop:
    podman stop --time 10 {{postgres_container}} >/dev/null

# Show local PostgreSQL container state and health.
database-status:
    podman ps --all --filter name={{postgres_container}}

# Run all checks required before a commit or CI completion.
validate: format-check lint typecheck test-coverage test-browser bundle-audit dependency-audit

# Install the browser, validate the app, and smoke-test its production image in CI.
ci: browser-install-ci validate container-smoke container-audit

# Stop only the application deployment for an explicitly confirmed incompatible worker cutover.
deployment-stop confirmation:
    @test {{ quote(confirmation) }} = stop-current-deployment
    railway down --service p1-integration-hub --yes

# Deploy the current checkout to the existing Railway application service.
deploy:
    railway up --service p1-integration-hub --detach

# Print the active project tool versions.
runtime:
    @echo "Node.js $(node --version)"
    @echo "pnpm $(pnpm --version)"
    @just --version
    @podman --version
