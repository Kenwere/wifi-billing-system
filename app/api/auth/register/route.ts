import { NextRequest, NextResponse } from "next/server";
import { mutateDb } from "@/lib/db";
import { generateVerificationCode, sendVerificationCodeEmail } from "@/lib/email";
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

  const verificationCode = generateVerificationCode();

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
      emailVerified: false,
      emailVerificationCodeHash: hashPassword(verificationCode),
      emailVerificationExpiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      paymentStatus: "trial" as const,
      paymentExpiresAt: trialEnds.toISOString(),
      trialEndsAt: trialEnds.toISOString(),
      createdAt: nowIso(),
    };
    db.adminUsers.push(user);
    if (!db.tenant.businessName) {
      db.tenant.businessName = businessName;
    }
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
    };
  }).catch((error: Error) => error);

  if (result instanceof Error) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  let verificationSent = true;
  try {
    await sendVerificationCodeEmail({
      email: result.email,
      fullName: result.fullName,
      code: verificationCode,
    });
  } catch {
    verificationSent = false;
  }

  return NextResponse.json({
    requiresVerification: true,
    verificationSent,
    email: result.email,
    message: verificationSent
      ? "Account created. Enter the OTP sent to your email."
      : "Account created. OTP email failed to send. Use resend OTP.",
  });
}
