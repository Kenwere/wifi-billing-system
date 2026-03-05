import { NextRequest, NextResponse } from "next/server";
import { loginAdmin, setAuthCookie } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const email = String(body.email ?? "");
  const password = String(body.password ?? "");
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }
  const result = await loginAdmin(email, password);
  if (!result) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  await setAuthCookie(result.token);
  return NextResponse.json({
    token: result.token,
    user: {
      id: result.user.id,
      fullName: result.user.fullName,
      email: result.user.email,
      role: result.user.role,
      paymentStatus: result.user.paymentStatus,
      paymentExpiresAt: result.user.paymentExpiresAt,
    },
  });
}
