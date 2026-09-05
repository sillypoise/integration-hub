"use client";

import Link from "next/link";
import { useState } from "react";
import { p1_runs_view, p1_run_category } from "../../lib/contracts/demo_views";
import { ErrorNotice, LoadingPanel, PageHeader, RunTable } from "./presentation";
import { use_demo_resource } from "./use_demo_resource";

export function RunsScreen() {
    const [page, set_page] = useState(1);
    return (
        <>
            <PageHeader
                title="Synchronization runs"
                description="Inspect the path and outcome of each customer update."
                action={
                    <Link className="button primary" href="/demo/controls" prefetch={false}>
                        + Create update
                    </Link>
                }
            />
            <RunsPage key={page} page={page} change_page={set_page} />
        </>
    );
}

function RunsPagination({
    page,
    shown,
    count,
    change_page,
}: Readonly<{
    page: number;
    shown: number;
    count: number;
    change_page: (page: number) => void;
}>) {
    return (
        <div className="pagination">
            <span>
                Page {page} · {shown} shown · up to 20 per page
            </span>
            <div className="actions">
                <button
                    type="button"
                    className="button secondary"
                    disabled={page === 1}
                    onClick={() => {
                        change_page(page - 1);
                    }}
                >
                    Previous page
                </button>
                <button
                    type="button"
                    className="button secondary"
                    disabled={page >= 50 || count < 20}
                    onClick={() => {
                        change_page(page + 1);
                    }}
                >
                    Next page
                </button>
            </div>
        </div>
    );
}

function RunsPage({
    page,
    change_page,
}: Readonly<{ page: number; change_page: (page: number) => void }>) {
    const resource = use_demo_resource(`/api/demo/runs?p1_page=${page}`, p1_runs_view, null);
    const [filter, set_filter] = useState("all");
    const runs = resource.data?.p1_runs ?? [];
    const filtered =
        filter === "all" ? runs : runs.filter((run) => p1_run_category(run) === filter);
    return (
        <>
            {resource.error ? (
                <ErrorNotice error={resource.error} refresh={resource.refresh} />
            ) : null}
            {resource.loading && resource.data === null ? <LoadingPanel /> : null}
            {resource.data ? (
                <section className="panel">
                    <div className="section-heading">
                        <div className="filter-control">
                            <label htmlFor="run-filter">Status on this page</label>
                            <select
                                id="run-filter"
                                value={filter}
                                onChange={(event) => {
                                    set_filter(event.target.value);
                                }}
                            >
                                <option value="all">All statuses</option>
                                <option value="succeeded">Succeeded</option>
                                <option value="pending">In progress</option>
                                <option value="attention">Needs attention</option>
                            </select>
                        </div>
                        <button
                            className="button secondary"
                            type="button"
                            onClick={resource.refresh}
                            disabled={resource.loading}
                        >
                            {resource.loading ? "Refreshing…" : "Refresh runs"}
                        </button>
                    </div>
                    {resource.stale ? (
                        <p className="notice" aria-live="polite">
                            Showing an older snapshot. Refresh failed.
                        </p>
                    ) : null}
                    <RunTable runs={filtered} filtered={filter !== "all" || page > 1} />
                    <RunsPagination
                        page={page}
                        shown={filtered.length}
                        count={runs.length}
                        change_page={change_page}
                    />
                </section>
            ) : null}
            <p className="caption">
                Lists are snapshots, not a live feed. Open an active run to follow its progress.
            </p>
        </>
    );
}
