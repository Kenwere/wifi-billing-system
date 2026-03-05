import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest, hasRole } from "@/lib/auth";
import { Role } from "@/lib/types";

export async function requireRole(request: NextRequest, role: Role) {
  const auth = await getAuthFromRequest(request);
  if (!auth) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!hasRole(auth.role, role)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true as const, auth };
}
