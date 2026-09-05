"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { z } from "zod";
import { demo_request, type DemoError } from "./demo_request";

type Resource<Value> = {
    data: Value | null;
    error: DemoError | null;
    loading: boolean;
    stale: boolean;
};

export function use_demo_resource<Value>(
    path: string,
    schema: z.ZodType<Value>,
    poll: ((value: Value) => boolean) | null,
) {
    const [generation, set_generation] = useState(0);
    const [resource, set_resource] = useState<Resource<Value>>({
        data: null,
        error: null,
        loading: true,
        stale: false,
    });
    useEffect(
        () => start_demo_resource({ path, schema, poll, set_resource }),
        [path, schema, poll, generation],
    );
    return {
        ...resource,
        refresh: () => {
            set_generation((previous) => previous + 1);
        },
    };
}

function start_demo_resource<Value>({
    path,
    schema,
    poll,
    set_resource,
}: {
    path: string;
    schema: z.ZodType<Value>;
    poll: ((value: Value) => boolean) | null;
    set_resource: Dispatch<SetStateAction<Resource<Value>>>;
}) {
    const controller = new AbortController();
    let disposed = false;
    let busy = false;
    let active = true;
    let requests = 0;
    set_resource((previous) => ({ ...previous, error: null, loading: true, stale: false }));
    async function read() {
        if (busy || !active || requests >= 30) return;
        busy = true;
        requests += 1;
        const result = await demo_request({
            path,
            schema,
            method: "GET",
            signal: controller.signal,
        });
        busy = false;
        if (disposed || controller.signal.aborted) return;
        if (result.ok) {
            active = poll === null ? false : poll(result.data);
            set_resource({ data: result.data, error: null, loading: false, stale: false });
        } else {
            active = false;
            set_resource((previous) => ({
                data: result.error === "unavailable" ? previous.data : null,
                error: result.error,
                loading: false,
                stale: result.error === "unavailable" && previous.data !== null,
            }));
        }
        if (!active) {
            clearInterval(interval);
            clearTimeout(deadline);
        }
    }
    void read();
    const interval =
        poll === null
            ? undefined
            : setInterval(() => {
                  void read();
              }, 2_000);
    const deadline =
        poll === null
            ? undefined
            : setTimeout(() => {
                  if (!active) return;
                  active = false;
                  clearInterval(interval);
                  controller.abort();
                  set_resource((previous) => ({ ...previous, loading: false, stale: true }));
              }, 60_000);
    return () => {
        disposed = true;
        controller.abort();
        clearInterval(interval);
        clearTimeout(deadline);
    };
}
