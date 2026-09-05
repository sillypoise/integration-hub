import type { NextRequest } from "next/server";
import { handle_p1_recovery_request } from "../../../../../lib/workspaces/recovery_http.ts";

export async function POST(request: NextRequest) {
    return handle_p1_recovery_request(request, null);
}
