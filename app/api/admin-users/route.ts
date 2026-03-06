import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/guards";
import { mutateDb, readDb } from "@/lib/db";
import { Role } from "@/lib/types";
import { hashPassword, nowIso, randomId } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const gate = await requireRole(request, "admin");
  if (!gate.ok) return gate.response;
  const db = await readDb();
  return NextResponse.json({
    users: db.adminUsers.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      paymentStatus: u.paymentStatus,
      paymentExpiresAt: u.paymentExpiresAt,
      createdAt: u.createdAt,
    })),
  });
}

export async function POST(request: NextRequest) {
  const gate = await requireRole(request, "super_admin");
  if (!gate.ok) return gate.response;
  const body = await request.json();
  const fullName = String(body.fullName ?? "");
  const email = String(body.email ?? "").toLowerCase();
  const password = String(body.password ?? "");
  const role = String(body.role ?? "support") as Role;
  if (!fullName || !email || !password) {
    return NextResponse.json({ error: "fullName, email, password are required" }, { status: 400 });
  }
  if (!["super_admin", "admin", "operator", "support"].includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  const user = await mutateDb((db) => {
    if (db.adminUsers.some((u) => u.email === email)) {
      throw new Error("Email already exists");
    }
    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + 14);
    const creator = db.adminUsers.find((u) => u.id === gate.auth.sub);
    const next = {
      id: randomId("admin"),
      fullName,
      email,
      businessName: creator?.businessName ?? db.tenant.businessName ?? "",
      businessLogoUrl: creator?.businessLogoUrl ?? db.tenant.businessLogoUrl ?? "",
      passwordHash: hashPassword(password),
      role,
      isActive: true,
      emailVerified: true,
      emailVerificationCodeHash: undefined,
      emailVerificationExpiresAt: undefined,
      paymentStatus: "trial" as const,
      paymentExpiresAt: trialEnds.toISOString(),
      trialEndsAt: trialEnds.toISOString(),
      createdAt: nowIso(),
    };
    db.adminUsers.push(next);
    return next;
  }).catch((error: Error) => error);

  if (user instanceof Error) {
    return NextResponse.json({ error: user.message }, { status: 400 });
  }
  return NextResponse.json({
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const gate = await requireRole(request, "super_admin");
  if (!gate.ok) return gate.response;
  const body = await request.json();
  const id = String(body.id ?? "");
  const role = body.role as Role | undefined;
  const isActive = body.isActive as boolean | undefined;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updated = await mutateDb((db) => {
    const user = db.adminUsers.find((u) => u.id === id);
    if (!user) throw new Error("User not found");
    if (role) {
      if (!["super_admin", "admin", "operator", "support"].includes(role)) {
        throw new Error("Invalid role");
      }
      user.role = role;
    }
    if (typeof isActive === "boolean") user.isActive = isActive;
    return user;
  }).catch((error: Error) => error);

  if (updated instanceof Error) {
    return NextResponse.json({ error: updated.message }, { status: 400 });
  }
  return NextResponse.json({ user: updated });
}
