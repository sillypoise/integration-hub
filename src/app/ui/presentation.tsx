import Link from "next/link";
import type { ReactNode } from "react";
import { p1_run_category, type P1RunView } from "../../lib/contracts/demo_views";
import type { DemoError } from "./demo_request";

export function PageHeader({
    title,
    description,
    action,
}: Readonly<{
    title: string;
    description: string;
    action?: ReactNode;
}>) {
    return (
        <div className="page-heading">
            <div>
                <div className="eyebrow">INTEGRATION OPERATIONS</div>
                <h1>{title}</h1>
                <p>{description}</p>
            </div>
            {action}
        </div>
    );
}

export function ErrorNotice({
    error,
    refresh,
}: Readonly<{ error: DemoError; refresh?: () => void }>) {
    const messages = {
        unauthorized: [
            "Your workspace is unavailable",
            "It may have expired. Return to the demo entry to start a new isolated workspace.",
        ],
        not_found: ["Run not available", "This run does not exist in your current workspace."],
        invalid: [
            "Check the requested values",
            "Use whole numbers from 1 to 1,000. No event was accepted.",
        ],
        limit: [
            "Workspace event limit reached",
            "This workspace already contains 1,000 events. You can still inspect existing runs.",
        ],
        retry_denied: [
            "Retry not available",
            "Refresh the run. Active, successful, or already manually retried runs cannot be retried.",
        ],
        reset_limit: [
            "Reset limit reached",
            "This workspace has used its three resets. You can start a fresh workspace instead.",
        ],
        unavailable: [
            "We couldn’t reach the service",
            "No fresh result is available. Try again in a moment; never assume an unconfirmed event failed.",
        ],
    } as const;
    return (
        <section className="notice error-notice" role="alert">
            <h2>{messages[error][0]}</h2>
            <p>{messages[error][1]}</p>
            <div className="actions">
                {error === "unauthorized" ? (
                    <Link className="button secondary" href="/" prefetch={false}>
                        Return to demo entry
                    </Link>
                ) : null}
                {error === "not_found" ? (
                    <Link className="button secondary" href="/demo/runs" prefetch={false}>
                        Back to runs
                    </Link>
                ) : null}
                {refresh ? (
                    <button type="button" className="button secondary" onClick={refresh}>
                        Try again
                    </button>
                ) : null}
            </div>
        </section>
    );
}

export function LoadingPanel() {
    return (
        <div className="panel loading-panel" aria-live="polite" aria-label="Loading workspace data">
            <span className="loading-line" />
            <span className="loading-line short" />
            <p>Loading workspace data…</p>
        </div>
    );
}

export function StatusBadge({ run }: Readonly<{ run: P1RunView }>) {
    const category = p1_run_category(run);
    const labels = {
        queued: "Queued",
        processing: "Processing",
        succeeded: "Succeeded",
        retryable_failure: "Retry scheduled",
        terminal_failure: "Failed",
    };
    const label =
        category === "attention" && run.p1_state === "queued"
            ? "Delivery stopped"
            : labels[run.p1_state];
    return (
        <span className={`badge ${category}`}>
            <span className="badge-dot" aria-hidden="true" />
            {label}
        </span>
    );
}

export function ConnectionPanel() {
    return (
        <section className="panel connection-panel" aria-labelledby="connection-title">
            <div className="section-heading">
                <h2 id="connection-title">One connection. A clear path.</h2>
                <span className="badge neutral">Both ends simulated</span>
            </div>
            <div className="connection-flow">
                <div>
                    <span className="provider-mark" aria-hidden="true">
                        C
                    </span>
                    <strong>Commerce</strong>
                    <small>Customer updated</small>
                </div>
                <div className="connection-middle">
                    <span aria-hidden="true">→</span>
                    <small>Validate · Queue · Map</small>
                </div>
                <div>
                    <span className="provider-mark destination" aria-hidden="true">
                        R
                    </span>
                    <strong>CRM</strong>
                    <small>Idempotent customer upsert</small>
                </div>
            </div>
            <p className="caption">
                Real application and durable worker. Synthetic data. No provider credentials
                required.
            </p>
        </section>
    );
}

export function RunTable({
    runs,
    filtered = false,
}: Readonly<{ runs: ReadonlyArray<P1RunView>; filtered?: boolean }>) {
    if (runs.length === 0)
        return (
            <div className="empty-state">
                <div className="empty-mark" aria-hidden="true">
                    ⇄
                </div>
                <h3>
                    {filtered ? "No matching runs on this page" : "Your first update starts here"}
                </h3>
                <p>
                    {filtered
                        ? "Choose another status or page to see more runs."
                        : "Send a synthetic customer update and follow it all the way to the CRM."}
                </p>
                {filtered ? null : (
                    <Link href="/demo/controls" className="button primary" prefetch={false}>
                        Create a customer update <span aria-hidden="true">→</span>
                    </Link>
                )}
            </div>
        );
    return (
        // Keyboard users need a focusable scroll region when columns exceed the viewport.
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        <section className="table-scroll" aria-label="Run table" tabIndex={0}>
            <p className="table-hint">Scroll the table horizontally for more columns.</p>
            <table>
                <caption className="sr-only">Synchronization runs in this workspace</caption>
                <thead>
                    <tr>
                        <th scope="col">Run</th>
                        <th scope="col">Status</th>
                        <th scope="col">Attempts</th>
                        <th scope="col">Created (UTC)</th>
                    </tr>
                </thead>
                <tbody>
                    {runs.map((run) => (
                        <tr key={run.p1_run_id}>
                            <td>
                                <Link
                                    className="run-link"
                                    href={`/demo/runs/${run.p1_run_id}`}
                                    prefetch={false}
                                >
                                    <span className="mono">{run.p1_run_id.slice(0, 8)}</span>
                                    <span className="sr-only"> Inspect run {run.p1_run_id}</span>
                                </Link>
                                <small>Customer update</small>
                            </td>
                            <td>
                                <StatusBadge run={run} />
                            </td>
                            <td>
                                {run.p1_attempt_count} <span className="muted">/ 4 max</span>
                            </td>
                            <td className="date-cell">
                                <time dateTime={run.p1_created_at}>
                                    {format_time(run.p1_created_at)}
                                </time>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </section>
    );
}

export function format_time(value: string): string {
    return new Date(value).toISOString().replace("T", " ").slice(0, 19);
}
