import { NextRequest, NextResponse } from "next/server";
import { createToken, setAuthCookie } from "@/lib/auth";
import { mutateDb } from "@/lib/db";
import { hashPassword, nowIso, randomId } from "@/lib/utils";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const fullName = String(body.fullName ?? "").trim();
  const email = String(body.email ?? "").toLowerCase().trim();
  const password = String(body.password ?? "");
  const businessName = String(body.businessName ?? "").trim();

  if (!fullName || !email || !password || !businessName) {
    return NextResponse.json(
      { error: "fullName, email, password and businessName are required" },
      { status: 400 },
    );
  }

  const result = await mutateDb((db) => {
    if (db.adminUsers.some((u) => u.email === email)) {
      throw new Error("Email already exists");
    }
    const trialEnds = new Date();
    trialEnds.setDate(trialEnds.getDate() + 14);
    const role = db.adminUsers.length === 0 ? "super_admin" : "admin";
    const user = {
      id: randomId("admin"),
      fullName,
      email,
      passwordHash: hashPassword(password),
      role: role as "super_admin" | "admin",
      isActive: true,
      paymentStatus: "trial" as const,
      paymentExpiresAt: trialEnds.toISOString(),
      trialEndsAt: trialEnds.toISOString(),
      createdAt: nowIso(),
    };
    db.adminUsers.push(user);
    if (!db.tenant.businessName) {
      db.tenant.businessName = businessName;
    }
    return user;
  }).catch((error: Error) => error);

  if (result instanceof Error) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  const token = createToken({ sub: result.id, email: result.email, role: result.role });
  await setAuthCookie(token);
  return NextResponse.json({
    token,
    user: {
      id: result.id,
      fullName: result.fullName,
      email: result.email,
      role: result.role,
      paymentStatus: result.paymentStatus,
      paymentExpiresAt: result.paymentExpiresAt,
    },
  });
}
