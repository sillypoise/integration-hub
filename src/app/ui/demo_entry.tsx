"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { p1_workspace_view } from "../../lib/contracts/demo_views";
import { demo_request, type DemoError } from "./demo_request";
import { ErrorNotice } from "./presentation";

export function DemoEntry({ fresh }: Readonly<{ fresh: boolean }>) {
    const router = useRouter();
    const [pending, set_pending] = useState(false);
    const [error, set_error] = useState<DemoError | null>(null);
    const busy = useRef(false);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    async function enter_demo() {
        if (busy.current) return;
        busy.current = true;
        set_pending(true);
        set_error(null);
        let result = fresh
            ? null
            : await demo_request({
                  path: "/api/demo/workspaces",
                  method: "GET",
                  schema: p1_workspace_view,
              });
        if (!mounted.current) return;
        if (result === null || (!result.ok && result.error === "unauthorized")) {
            result = await demo_request({
                path: "/api/demo/workspaces",
                method: "POST",
                schema: p1_workspace_view,
            });
        }
        if (!mounted.current) return;
        busy.current = false;
        set_pending(false);
        if (!result.ok) {
            set_error(result.error);
            return;
        }
        router.push("/demo", { scroll: true });
    }
    return (
        <div className="entry-control">
            <button
                type="button"
                className={`button ${fresh ? "secondary" : "primary"}`}
                disabled={pending}
                onClick={() => {
                    void enter_demo();
                }}
            >
                {pending
                    ? "Opening your workspace…"
                    : fresh
                      ? "Start a fresh workspace"
                      : "Enter live demo"}
                <span aria-hidden="true"> →</span>
            </button>
            {error ? <ErrorNotice error={error} /> : null}
        </div>
    );
}
