import { NextRequest, NextResponse } from "next/server";
import { expireAndDisconnectSessions } from "@/lib/billing";
import { readDb } from "@/lib/db";
import { requireRole } from "@/lib/guards";

export async function GET(request: NextRequest) {
  const gate = await requireRole(request, "support");
  if (!gate.ok) return gate.response;
  await expireAndDisconnectSessions();
  const db = await readDb();
  return NextResponse.json({ sessions: db.sessions });
}
