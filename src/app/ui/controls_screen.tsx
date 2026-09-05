"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { p1_acceptance_view, p1_workspace_view } from "../../lib/contracts/demo_views";
import { demo_request, type DemoError } from "./demo_request";
import { DemoEntry } from "./demo_entry";
import { RecoveryControl } from "./recovery_control";
import { ConnectionPanel, ErrorNotice, LoadingPanel, PageHeader } from "./presentation";
import { use_demo_resource } from "./use_demo_resource";

export function ControlsScreen() {
    const resource = use_demo_resource("/api/demo/workspaces", p1_workspace_view, null);
    const [form_generation, set_form_generation] = useState(0);
    function on_reset() {
        set_form_generation((generation) => generation + 1);
    }
    return (
        <>
            <PageHeader
                title="Demo controls"
                description="Create a safe customer update. Watch real background work happen."
            />
            {resource.error ? (
                <ErrorNotice error={resource.error} refresh={resource.refresh} />
            ) : null}
            {resource.loading ? <LoadingPanel /> : null}
            {resource.data ? (
                <>
                    <div className="controls-grid">
                        <EventForm key={form_generation} />
                        <section className="panel guide-panel">
                            <span className="eyebrow">TRY IT YOURSELF</span>
                            <h2>A small update. The whole journey.</h2>
                            <ol className="steps">
                                <li>
                                    <strong>Create an update</strong>
                                    <p>
                                        Defaults are ready to send. We generate a fictional
                                        customer—no personal data needed.
                                    </p>
                                </li>
                                <li>
                                    <strong>Inspect the run</strong>
                                    <p>
                                        Follow the durable job through mapping to a recorded CRM
                                        effect.
                                    </p>
                                </li>
                                <li>
                                    <strong>Prove safe replay</strong>
                                    <p>
                                        Send the same customer and revision again. It resolves to
                                        the same run, not a second effect.
                                    </p>
                                </li>
                            </ol>
                            <p className="caption">
                                Increase the revision to update the same customer. Change the
                                customer number to create a different synthetic customer.
                            </p>
                        </section>
                    </div>
                    <ConnectionPanel />
                    <RecoveryControl nullable_run_id={null} on_complete={on_reset} />
                    <ControlsFreshWorkspace />
                </>
            ) : null}
        </>
    );
}

function ControlsFreshWorkspace() {
    return (
        <section className="panel fresh-panel">
            <div>
                <h2>Start with a clean view</h2>
                <p>
                    A fresh workspace replaces this browser’s session. It does not delete the old
                    workspace; old data expires automatically after 24 hours.
                </p>
            </div>
            <DemoEntry fresh={true} />
        </section>
    );
}

type AcceptedEvent = { p1_run_id: string; duplicate: boolean };

function EventFormHeading() {
    return (
        <div className="section-heading">
            <h2>Create a customer update</h2>
            <span className="badge neutral">Synthetic only</span>
        </div>
    );
}

function EventForm() {
    const [pending, set_pending] = useState(false);
    const [error, set_error] = useState<DemoError | null>(null);
    const [accepted, set_accepted] = useState<AcceptedEvent | null>(null);
    const busy = useRef(false);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy.current) return;
        busy.current = true;
        set_pending(true);
        set_error(null);
        set_accepted(null);
        const form = new FormData(event.currentTarget);
        const result = await demo_request({
            path: "/api/demo/events",
            method: "POST",
            schema: p1_acceptance_view,
            body: {
                p1_customer_number: Number(form.get("customer-number")),
                p1_revision: Number(form.get("revision")),
                p1_scenario: form.get("scenario"),
            },
        });
        if (!mounted.current) return;
        busy.current = false;
        set_pending(false);
        if (!result.ok) {
            set_error(result.error);
            return;
        }
        set_accepted(result.data);
    }
    return (
        <section className="panel event-form">
            <EventFormHeading />
            <form
                onChange={() => {
                    set_accepted(null);
                }}
                onSubmit={(event) => {
                    void submit(event);
                }}
            >
                <EventFormNumbers pending={pending} />
                <EventFormScenario pending={pending} />
                <button className="button primary" type="submit" disabled={pending}>
                    {pending ? "Submitting update…" : "Send customer update"}
                </button>
            </form>
            {error ? <ErrorNotice error={error} /> : null}
            {accepted ? <EventAcceptedNotice accepted={accepted} /> : null}
        </section>
    );
}

function EventFormNumbers({ pending }: Readonly<{ pending: boolean }>) {
    return (
        <>
            <EventNumberField
                id="customer-number"
                label="Customer number"
                hint="A fictional customer from 1 to 1,000."
                pending={pending}
            />
            <EventNumberField
                id="revision"
                label="Revision"
                hint="1 to 1,000. Same customer + revision + scenario = safe replay."
                pending={pending}
            />
        </>
    );
}

function EventFormScenario({ pending }: Readonly<{ pending: boolean }>) {
    return (
        <div className="form-field">
            <label htmlFor="scenario">Destination scenario</label>
            <select
                id="scenario"
                name="scenario"
                defaultValue="success"
                disabled={pending}
                aria-describedby="scenario-help"
            >
                <option value="success">Success</option>
                <option value="rate_limit">Rate limit → recovers on attempt 2</option>
                <option value="temporary_outage">Temporary outage → recovers on attempt 3</option>
                <option value="persistent_outage">Persistent outage → exhausts 3 attempts</option>
                <option value="invalid_destination">
                    Invalid destination data → stops immediately
                </option>
            </select>
            <p id="scenario-help">
                Deterministic simulation. Retries wait 5 then 10 seconds. Replay identity includes
                customer, revision, and scenario.
            </p>
        </div>
    );
}

function EventNumberField({
    id,
    label,
    hint,
    pending,
}: Readonly<{
    id: string;
    label: string;
    hint: string;
    pending: boolean;
}>) {
    return (
        <div className="form-field">
            <label htmlFor={id}>{label}</label>
            <input
                id={id}
                name={id}
                type="number"
                inputMode="numeric"
                required
                min={1}
                max={1_000}
                step={1}
                defaultValue="1"
                disabled={pending}
                aria-describedby={`${id}-help`}
            />
            <p id={`${id}-help`}>{hint}</p>
        </div>
    );
}

function EventAcceptedNotice({
    accepted,
}: Readonly<{
    accepted: { p1_run_id: string; duplicate: boolean };
}>) {
    return (
        <div className="notice success-notice" aria-live="polite">
            <h3>
                {accepted.duplicate
                    ? "Already accepted. No duplicate work."
                    : "Update accepted and queued."}
            </h3>
            <p>
                {accepted.duplicate
                    ? "This customer revision already has a run."
                    : "Your update is durable. Open its run to follow the result."}
            </p>
            <Link
                className="button primary"
                href={`/demo/runs/${accepted.p1_run_id}`}
                prefetch={false}
            >
                Inspect run →
            </Link>
        </div>
    );
}
