import { NextRequest, NextResponse } from "next/server";
import { readDb } from "@/lib/db";
import { requireRole } from "@/lib/guards";

export async function GET(request: NextRequest) {
  const gate = await requireRole(request, "admin");
  if (!gate.ok) return gate.response;

  const db = await readDb();
  const users =
    gate.auth.role === "super_admin"
      ? db.hotspotUsers
      : db.hotspotUsers.filter((u) => u.createdBy === gate.auth.sub);
  const payload = {
    type: "hotspot_users_export",
    version: 1,
    exportedAt: new Date().toISOString(),
    users,
  };

  const fileDate = new Date().toISOString().slice(0, 10);
  const fileName = `users-${fileDate}.json`;
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
