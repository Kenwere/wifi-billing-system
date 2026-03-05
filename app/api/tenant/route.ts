import { NextRequest, NextResponse } from "next/server";
import { mutateDb, readDb } from "@/lib/db";
import { requireRole } from "@/lib/guards";

export async function GET(request: NextRequest) {
  const gate = await requireRole(request, "support");
  if (!gate.ok) return gate.response;
  const db = await readDb();
  return NextResponse.json({ tenant: db.tenant });
}

export async function PATCH(request: NextRequest) {
  const gate = await requireRole(request, "admin");
  if (!gate.ok) return gate.response;
  const body = await request.json();
  const businessName = String(body.businessName ?? "").trim();
  const businessLogoUrl = String(body.businessLogoUrl ?? "").trim();
  if (!businessName) {
    return NextResponse.json({ error: "businessName is required" }, { status: 400 });
  }
  const tenant = await mutateDb((db) => {
    db.tenant.businessName = businessName;
    db.tenant.businessLogoUrl = businessLogoUrl;
    return db.tenant;
  });
  return NextResponse.json({ tenant });
}
