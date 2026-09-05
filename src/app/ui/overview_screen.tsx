"use client";

import Link from "next/link";
import type { z } from "zod";
import { p1_overview_view } from "../../lib/contracts/demo_views";
import {
    ConnectionPanel,
    ErrorNotice,
    format_time,
    LoadingPanel,
    PageHeader,
    RunTable,
} from "./presentation";
import { use_demo_resource } from "./use_demo_resource";

function OverviewMetrics({ data }: Readonly<{ data: z.infer<typeof p1_overview_view> }>) {
    const metrics = [
        { label: "Total updates", value: data.p1_total, note: "In this workspace" },
        { label: "Succeeded", value: data.p1_succeeded, note: "Destination effect recorded" },
        { label: "In progress", value: data.p1_pending, note: "Queued or processing" },
        { label: "Needs attention", value: data.p1_attention, note: "Run or delivery stopped" },
    ];
    return (
        <div className="metrics">
            {metrics.map((metric) => (
                <section key={metric.label} className="metric">
                    <h2>{metric.label}</h2>
                    <strong>{metric.value}</strong>
                    <span>{metric.note}</span>
                </section>
            ))}
        </div>
    );
}

export function OverviewScreen() {
    const resource = use_demo_resource("/api/demo/overview", p1_overview_view, null);
    return (
        <>
            <PageHeader
                title="Overview"
                description="Every customer update, from source to destination."
                action={
                    <Link href="/demo/controls" className="button primary" prefetch={false}>
                        + Create update
                    </Link>
                }
            />
            {resource.error ? (
                <ErrorNotice error={resource.error} refresh={resource.refresh} />
            ) : null}
            {resource.loading && resource.data === null ? <LoadingPanel /> : null}
            {resource.data ? (
                <>
                    <div className="snapshot-bar">
                        <span>
                            {resource.stale
                                ? "Showing an older snapshot. Refresh failed."
                                : "Workspace snapshot · refresh to check for changes"}
                        </span>
                        <button
                            className="button subtle"
                            type="button"
                            disabled={resource.loading}
                            onClick={resource.refresh}
                        >
                            {resource.loading ? "Refreshing…" : "Refresh overview"}
                        </button>
                    </div>
                    <OverviewMetrics data={resource.data} />
                    <ConnectionPanel />
                    <section className="panel">
                        <div className="section-heading">
                            <div>
                                <h2>Recent synchronization runs</h2>
                                <p className="caption">The latest six updates in your workspace.</p>
                            </div>
                            <Link href="/demo/runs" className="text-link" prefetch={false}>
                                View all runs →
                            </Link>
                        </div>
                        <RunTable runs={resource.data.p1_recent} />
                    </section>
                    <p className="caption workspace-expiry">
                        Workspace expires {format_time(resource.data.p1_expires_at)} UTC. Only
                        synthetic data is retained.
                    </p>
                </>
            ) : null}
        </>
    );
}
