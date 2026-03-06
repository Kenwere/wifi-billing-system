import { NextRequest, NextResponse } from "next/server";
import { createToken, setAuthCookie } from "@/lib/auth";
import { mutateDb } from "@/lib/db";
import { hashPassword, safeCompare } from "@/lib/utils";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").toLowerCase().trim();
  const code = String(body.code ?? "").trim();

  if (!email || !code) {
    return NextResponse.json({ error: "Email and code are required" }, { status: 400 });
  }

  const result = await mutateDb((db) => {
    const user = db.adminUsers.find((u) => u.email === email);
    if (!user) throw new Error("Account not found");
    if (user.emailVerified) {
      return { alreadyVerified: true as const, user };
    }
    if (!user.emailVerificationCodeHash || !user.emailVerificationExpiresAt) {
      throw new Error("OTP not found. Request a new OTP.");
    }
    if (new Date(user.emailVerificationExpiresAt) < new Date()) {
      throw new Error("OTP expired. Request a new OTP.");
    }
    const candidateHash = hashPassword(code);
    if (!safeCompare(candidateHash, user.emailVerificationCodeHash)) {
      throw new Error("Invalid OTP");
    }
    user.emailVerified = true;
    user.emailVerificationCodeHash = undefined;
    user.emailVerificationExpiresAt = undefined;
    return { alreadyVerified: false as const, user };
  }).catch((error: Error) => error);

  if (result instanceof Error) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  const token = createToken({
    sub: result.user.id,
    email: result.user.email,
    role: result.user.role,
  });
  await setAuthCookie(token);

  return NextResponse.json({
    token,
    user: {
      id: result.user.id,
      fullName: result.user.fullName,
      email: result.user.email,
      role: result.user.role,
      paymentStatus: result.user.paymentStatus,
      paymentExpiresAt: result.user.paymentExpiresAt,
    },
    message: result.alreadyVerified ? "Email already verified." : "Email verified successfully.",
  });
}
