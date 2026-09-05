import type { NextRequest } from "next/server";
import { handle_p1_recovery_request } from "../../../../../../lib/workspaces/recovery_http.ts";

export async function POST(request: NextRequest, context: { params: Promise<{ run_id: string }> }) {
    const { run_id } = await context.params;
    return handle_p1_recovery_request(request, run_id);
}
