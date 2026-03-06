import { NextRequest, NextResponse } from "next/server";
import { mutateDb, readDb } from "@/lib/db";
import { requireRole } from "@/lib/guards";

export async function GET(request: NextRequest) {
  const gate = await requireRole(request, "support");
  if (!gate.ok) return gate.response;
  const db = await readDb();
  if (gate.auth.role === "super_admin") {
    return NextResponse.json({ tenant: db.tenant });
  }
  const user = db.adminUsers.find((u) => u.id === gate.auth.sub);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    tenant: {
      id: `tenant_${user.id}`,
      businessName: user.businessName,
      businessLogoUrl: user.businessLogoUrl ?? "",
      createdAt: user.createdAt,
      subscription: {
        trialEndsAt: user.trialEndsAt,
        paidUntil: user.paymentExpiresAt,
        lockReason: user.paymentStatus === "overdue" ? "Subscription payment overdue" : undefined,
      },
    },
  });
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
    if (gate.auth.role === "super_admin") {
      db.tenant.businessName = businessName;
      db.tenant.businessLogoUrl = businessLogoUrl;
      return db.tenant;
    }
    const user = db.adminUsers.find((u) => u.id === gate.auth.sub);
    if (!user) throw new Error("Unauthorized");
    user.businessName = businessName;
    user.businessLogoUrl = businessLogoUrl;
    return {
      id: `tenant_${user.id}`,
      businessName: user.businessName,
      businessLogoUrl: user.businessLogoUrl ?? "",
      createdAt: user.createdAt,
      subscription: {
        trialEndsAt: user.trialEndsAt,
        paidUntil: user.paymentExpiresAt,
        lockReason: user.paymentStatus === "overdue" ? "Subscription payment overdue" : undefined,
      },
    };
  });
  return NextResponse.json({ tenant });
}
