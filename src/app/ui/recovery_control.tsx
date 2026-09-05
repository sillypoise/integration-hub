"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
    p1_recovery_response_schema,
    p1_reset_response_schema,
} from "../../lib/contracts/recovery";
import { demo_request, type DemoError } from "./demo_request";
import { ErrorNotice } from "./presentation";

export function RecoveryControl({
    nullable_run_id,
    on_complete,
}: Readonly<{
    nullable_run_id: string | null;
    on_complete: () => void;
}>) {
    const [pending, set_pending] = useState(false);
    const [error, set_error] = useState<DemoError | null>(null);
    const [completed, set_completed] = useState(false);
    const busy = useRef(false);
    const mounted = useRef(true);
    const request_id = useRef<string | null>(null);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    const reset = nullable_run_id === null;
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (busy.current) return;
        busy.current = true;
        set_pending(true);
        set_error(null);
        set_completed(false);
        const form = event.currentTarget;
        request_id.current ??= crypto.randomUUID();
        const result = await demo_request<{ code: "WORKSPACE_RESET" | "RETRY_ACCEPTED" }>({
            path: reset ? "/api/demo/workspaces/reset" : `/api/demo/runs/${nullable_run_id}/retry`,
            method: "POST",
            schema: reset ? p1_reset_response_schema : p1_recovery_response_schema,
            body: reset
                ? { p1_confirm: true, p1_request_id: request_id.current }
                : { p1_confirm: true },
        });
        if (!mounted.current) return;
        busy.current = false;
        set_pending(false);
        if (!result.ok) {
            set_error(
                result.error === "limit" ? (reset ? "reset_limit" : "retry_denied") : result.error,
            );
            return;
        }
        request_id.current = null;
        form.reset();
        set_completed(true);
        on_complete();
    }
    return <RecoveryControlForm {...{ reset, pending, error, completed, submit }} />;
}

function RecoveryControlForm({
    reset,
    pending,
    error,
    completed,
    submit,
}: Readonly<{
    reset: boolean;
    pending: boolean;
    error: DemoError | null;
    completed: boolean;
    submit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}>) {
    return (
        <section className="panel recovery-panel">
            <h2>{reset ? "Reset this workspace" : "Restore & retry once"}</h2>
            <p>
                {reset
                    ? "Delete this workspace’s synthetic events, runs, attempts, and CRM records. Audit history and your session remain. Limited to three resets; no other workspace or external system is affected."
                    : "Restore this run’s simulated destination and queue one manual attempt. Previous failures remain in the timeline. This does not change a real provider or other runs."}
            </p>
            <form
                onSubmit={(event) => {
                    void submit(event);
                }}
            >
                <label className="confirmation">
                    <input type="checkbox" required disabled={pending} />
                    {reset
                        ? "I understand this deletes my synthetic records."
                        : "Restore the simulator for this run and retry."}
                </label>
                <button className="button secondary" type="submit" disabled={pending}>
                    {pending
                        ? "Submitting…"
                        : reset
                          ? "Reset synthetic records"
                          : "Restore simulator & retry"}
                </button>
            </form>
            {error ? <ErrorNotice error={error} /> : null}
            {completed ? (
                <output>
                    {reset
                        ? "Workspace reset. Audit history preserved."
                        : "Manual retry accepted. Checking progress…"}
                </output>
            ) : null}
        </section>
    );
}
