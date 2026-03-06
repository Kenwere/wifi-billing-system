import { NextRequest, NextResponse } from "next/server";
import { expireAndDisconnectSessions } from "@/lib/billing";
import { readDb } from "@/lib/db";
import { requireRole } from "@/lib/guards";

export async function GET(request: NextRequest) {
  const gate = await requireRole(request, "support");
  if (!gate.ok) return gate.response;
  await expireAndDisconnectSessions();
  const db = await readDb();
  if (gate.auth.role === "super_admin") {
    return NextResponse.json({ sessions: db.sessions });
  }
  return NextResponse.json({
    sessions: db.sessions.filter((s) => s.createdBy === gate.auth.sub),
  });
}
