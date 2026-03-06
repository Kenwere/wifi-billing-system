import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { readDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  const auth = await getAuthFromRequest(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = await readDb();
  const user = db.adminUsers.find((u) => u.id === auth.sub);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      paymentStatus: user.paymentStatus,
      paymentExpiresAt: user.paymentExpiresAt,
      trialEndsAt: user.trialEndsAt,
    },
  });
}
