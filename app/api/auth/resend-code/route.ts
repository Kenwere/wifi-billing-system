import { NextRequest, NextResponse } from "next/server";
import { mutateDb } from "@/lib/db";
import { generateVerificationCode, sendVerificationCodeEmail } from "@/lib/email";
import { hashPassword } from "@/lib/utils";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").toLowerCase().trim();
  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const code = generateVerificationCode();

  const result = await mutateDb((db) => {
    const user = db.adminUsers.find((u) => u.email === email);
    if (!user) throw new Error("Account not found");
    if (user.emailVerified) throw new Error("Email is already verified");
    user.emailVerificationCodeHash = hashPassword(code);
    user.emailVerificationExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    return { email: user.email, fullName: user.fullName };
  }).catch((error: Error) => error);

  if (result instanceof Error) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  try {
    await sendVerificationCodeEmail({
      email: result.email,
      fullName: result.fullName,
      code,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, message: "OTP sent." });
}
