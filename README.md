# Integration Hub

Integration Hub is an independent portfolio product concept for monitoring and recovering a narrow,
business-critical synchronization between a commerce system and a CRM.

The project is intentionally shallow in breadth and complete in depth. It will demonstrate one real
vertical flow, polished operational visibility, deterministic failure handling, and a deployable
public demo without pretending to be a general-purpose integration platform.

## Status

Stages 1 through 6 are complete; Stage 7 is next. The product boundary is documented in
[`docs/product-brief.md`](docs/product-brief.md), the stack in
[`docs/tech-stack.md`](docs/tech-stack.md), and the delivery sequence in
[`docs/implementation-plan.md`](docs/implementation-plan.md). Completed work is summarized in
[`docs/stage-reports/`](docs/stage-reports/).

## Using the demo

Open the introduction and choose **Enter live demo**. The overview starts empty. Use **Create
update**, send the default synthetic customer, then **Inspect run** to see its mapping and result.
Send the same customer and revision again to verify safe replay. No account or provider credentials
are needed. Both integration endpoints are simulators; the application, queue, and database are
real.

For failure recovery, choose **Destination scenario** in Demo controls. A rate limit recovers on
attempt two; a temporary outage on three. A persistent outage exhausts automatic retries after five-
and ten-second waits. Invalid destination data stops immediately. Failed runs offer one confirmed
**Restore simulator & retry** action, preserving their history. **Reset synthetic records** deletes
only your workspace's synthetic records, keeps audit history, and allows three resets; starting a
fresh workspace is a separate action.

## Local development

Prerequisites:

- Node.js 22.23.2 through 24.x and pnpm 10.33.2. CI uses Node.js 22.23.2.
- Just 1.43.1.
- Podman 5 or newer.

```bash
just bootstrap
just dev
```

The application is available at `http://127.0.0.1:3000` (matching `APPLICATION_ORIGIN`). Stop the
database with `just database-stop`. The named volume remains intact.

Run `just` to list supported commands. Run the complete local validation with:

```bash
just validate
```

### CI and deployment checks

Application changes on `main` and all pull requests run the complete CI suite. Pushes that change
only `docs/**`, root `README.md`, or root `AGENTS.md` skip it; mixed documentation/code changes
still run every check. Pull requests deliberately have no path filter, avoiding pending required
checks. Run `just format-check` locally for documentation edits. Manual CI dispatch remains
available.

CI invokes the same `just` recipes as `just ci`, with separate steps and timeouts for browser setup,
formatting, lint, types, database tests, build, browser tests, and container smoke testing. Browser
setup has a five-minute limit; the whole job retains its 20-minute ceiling. A timeout fails CI
rather than bypassing a check. `just test-browser-built` requires a current production build;
normally use `just test-browser`, which builds first.

Wait for successful CI on application changes before deployment. Documentation-only follow-up
commits need no deployment or another blocking CI wait. Investigate the named step when a run is
unusually slow rather than repeatedly polling without diagnosis.

The
[Stage 5 documentation run](https://github.com/sillypoise/integration-hub/actions/runs/33936391669)
hit the previous 20-minute limit downloading Ubuntu font packages during Playwright setup, before
application checks began. The new step limit bounds that failure; it does not fix external mirrors.
The split workflow passed
[CI run 33938289867](https://github.com/sillypoise/integration-hub/actions/runs/33938289867) in
3m29s. That verification also exposed and corrected a virtual-clock test race: the polling test now
waits for each response to render and checks the exact 30-request / 60-second boundary.

### Linux watcher capacity

`just dev` checks that Linux has enough free inotify instances before starting Next.js. If it
reports low capacity, close idle editor and development-server processes first. To raise the current
machine's temporary per-user limit when those processes are intentional, run:

```bash
sudo sysctl -w fs.inotify.max_user_instances=1024
```

## Portfolio positioning

This is an **Independent Project** and **Product Concept**, not client work or a production-proven
business. The public demo will clearly identify simulated systems, seeded data, and measured
behavior.
