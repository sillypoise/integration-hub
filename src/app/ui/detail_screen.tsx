"use client";

import Link from "next/link";
import {
    p1_detail_is_active,
    p1_run_detail_view,
    type P1DetailView,
} from "../../lib/contracts/demo_views";
import { ErrorNotice, format_time, LoadingPanel, PageHeader, StatusBadge } from "./presentation";
import { use_demo_resource } from "./use_demo_resource";

export function DetailScreen({ run_id }: Readonly<{ run_id: string }>) {
    const resource = use_demo_resource(
        `/api/demo/runs/${run_id}`,
        p1_run_detail_view,
        p1_detail_is_active,
    );
    return (
        <>
            <Link className="text-link back-link" href="/demo/runs" prefetch={false}>
                ← All synchronization runs
            </Link>
            <PageHeader
                title="Run detail"
                description="One update, with a traceable result at every boundary."
                action={
                    <button
                        className="button secondary"
                        type="button"
                        disabled={resource.loading}
                        onClick={resource.refresh}
                    >
                        {resource.loading ? "Refreshing…" : "Refresh run"}
                    </button>
                }
            />
            {resource.error ? (
                <ErrorNotice error={resource.error} refresh={resource.refresh} />
            ) : null}
            {resource.loading && resource.data === null ? <LoadingPanel /> : null}
            {resource.stale ? (
                <div className="notice" aria-live="polite">
                    <strong>Live updates paused</strong>
                    <p>
                        This snapshot may be out of date. Refresh to check again; pausing does not
                        stop the worker.
                    </p>
                </div>
            ) : null}
            {resource.data ? (
                <>
                    <RunOutcome run={resource.data} />
                    <div className="detail-grid">
                        <MappingPanel run={resource.data} />
                        <RunTimeline run={resource.data} />
                    </div>
                    <section className="panel identifiers">
                        <h2>Trace identifiers</h2>
                        <dl>
                            <div>
                                <dt>Run / correlation ID</dt>
                                <dd className="mono">{resource.data.p1_correlation_id}</dd>
                            </div>
                            <div>
                                <dt>Source event ID</dt>
                                <dd className="mono">{resource.data.p1_source_event_id}</dd>
                            </div>
                        </dl>
                    </section>
                </>
            ) : null}
        </>
    );
}

function RunOutcome({ run }: Readonly<{ run: P1DetailView }>) {
    const active = p1_detail_is_active(run);
    return (
        <section className="panel outcome-panel" aria-label="Run outcome">
            <div className="outcome-heading">
                <div>
                    <span className="eyebrow">COMMERCE → CRM · SIMULATED</span>
                    <h2>
                        {run.p1_state === "succeeded"
                            ? "Customer synchronized"
                            : active
                              ? "Your update is on its way"
                              : "This run needs a closer look"}
                    </h2>
                </div>
                <StatusBadge run={run} />
            </div>
            <p>
                {run.p1_state === "succeeded"
                    ? "One destination effect recorded. Sending this revision again will not create another."
                    : active
                      ? "The worker will validate, map, and upsert this customer. This view checks for progress automatically."
                      : "No successful outcome is implied. Failure and manual recovery controls are not available in this stage."}
            </p>
            <div className="outcome-facts">
                <span>
                    <strong>{run.p1_attempt_count}</strong> committed attempt
                    {run.p1_attempt_count === 1 ? "" : "s"}
                </span>
                <span>
                    Queue delivery:{" "}
                    <strong>{run.p1_delivery_state ?? "No retained queue record"}</strong>
                </span>
                <span>{active ? "Auto-refresh · up to 60 seconds" : "Auto-refresh stopped"}</span>
            </div>
        </section>
    );
}

function MappingPanel({ run }: Readonly<{ run: P1DetailView }>) {
    return (
        <section className="panel mapping-panel">
            <div className="section-heading">
                <h2>Source & mapping</h2>
                <span className="badge neutral">Synthetic data</span>
            </div>
            <div className="source-summary">
                <span className="eyebrow">ACCEPTED COMMERCE EVENT</span>
                <h3>Customer updated</h3>
                <dl>
                    <div>
                        <dt>Customer</dt>
                        <dd className="mono">{run.p1_source.p1_external_id}</dd>
                    </div>
                    <div>
                        <dt>Source time (UTC)</dt>
                        <dd>{format_time(run.p1_source.p1_updated_at)}</dd>
                    </div>
                </dl>
                <p className="caption">
                    Source time is a deterministic simulator timestamp, not the intake time.
                </p>
            </div>
            <div className="mapping-output">
                <span className="eyebrow">MAPPED CRM EFFECT</span>
                {run.p1_destination ? (
                    <dl>
                        {[
                            ["External customer ID", run.p1_destination.p1_external_id],
                            ["Email", run.p1_destination.p1_email],
                            ["First name", run.p1_destination.p1_first_name],
                            ["Last name", run.p1_destination.p1_last_name],
                            [
                                "Source time → CRM source time",
                                format_time(run.p1_destination.p1_source_updated_at),
                            ],
                        ].map(([label, value]) => (
                            <div key={label}>
                                <dt>{label}</dt>
                                <dd>{value}</dd>
                            </div>
                        ))}
                    </dl>
                ) : (
                    <p className="muted">No destination effect has been recorded yet.</p>
                )}
                <p className="caption">
                    This run’s mapped result, not necessarily the customer’s latest revision.
                </p>
            </div>
        </section>
    );
}

function RunTimeline({ run }: Readonly<{ run: P1DetailView }>) {
    return (
        <section className="panel timeline-panel">
            <div className="section-heading">
                <h2>Execution timeline</h2>
            </div>
            <ol className="timeline">
                <li>
                    <strong>Event accepted & queued</strong>
                    <time dateTime={run.p1_created_at}>{format_time(run.p1_created_at)} UTC</time>
                    <p>Source, run, and durable job committed together.</p>
                </li>
                {run.p1_attempts.map((attempt) => (
                    <li key={attempt.p1_attempt_number}>
                        <strong>
                            Attempt {attempt.p1_attempt_number} ·{" "}
                            {attempt.p1_state.replaceAll("_", " ")}
                        </strong>
                        <time dateTime={attempt.p1_started_at}>
                            {format_time(attempt.p1_started_at)} UTC
                        </time>
                        <p>
                            {attempt.p1_completed_at
                                ? `Finished ${format_time(attempt.p1_completed_at)} UTC`
                                : "No completion recorded."}
                        </p>
                    </li>
                ))}
                {run.p1_completed_at ? (
                    <li>
                        <strong>Run completed</strong>
                        <time dateTime={run.p1_completed_at}>
                            {format_time(run.p1_completed_at)} UTC
                        </time>
                    </li>
                ) : null}
            </ol>
            <p className="caption timeline-note">
                Only committed attempts appear here. Interrupted transactions roll back; queue
                redeliveries are separate.
            </p>
        </section>
    );
}
