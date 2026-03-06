import { NextRequest, NextResponse } from "next/server";
import { readDb } from "@/lib/db";
import { requireRole } from "@/lib/guards";

export async function GET(request: NextRequest) {
  const gate = await requireRole(request, "support");
  if (!gate.ok) return gate.response;
  const db = await readDb();
  if (gate.auth.role === "super_admin") {
    return NextResponse.json({ payments: db.payments });
  }
  return NextResponse.json({
    payments: db.payments.filter((p) => p.createdBy === gate.auth.sub),
  });
}
