import { NextRequest, NextResponse } from "next/server";
import { mutateDb } from "@/lib/db";
import { verifyPaystackTransaction } from "@/lib/paystack";

function addMonthsKeepingAnchor(from: Date, months: number, anchorDay: number): Date {
  const year = from.getUTCFullYear();
  const month = from.getUTCMonth() + months;
  const candidate = new Date(Date.UTC(year, month, 1));
  const maxDay = new Date(Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, 0)).getUTCDate();
  candidate.setUTCDate(Math.min(anchorDay, maxDay));
  return candidate;
}

export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get("reference");
  const adminId = request.nextUrl.searchParams.get("adminId");
  if (!reference) {
    return NextResponse.json({ error: "reference is required" }, { status: 400 });
  }
  if (!adminId) {
    return NextResponse.json({ error: "adminId is required" }, { status: 400 });
  }

  const verified = await verifyPaystackTransaction(reference).catch((error: Error) => error);
  if (verified instanceof Error) {
    return NextResponse.json({ error: verified.message }, { status: 400 });
  }

  if (verified.status !== "success") {
    return NextResponse.redirect(new URL("/admin?subscription=failed", request.url));
  }

  await mutateDb((db) => {
    const user = db.adminUsers.find((u) => u.id === adminId);
    if (!user) throw new Error("Admin not found");
    if (user.pendingPaystackReference && user.pendingPaystackReference !== reference) {
      throw new Error("Reference mismatch");
    }
    const now = new Date();
    const currentPaidUntil = user.paymentExpiresAt
      ? new Date(user.paymentExpiresAt)
      : null;
    const startDate = currentPaidUntil && currentPaidUntil > now ? currentPaidUntil : now;
    const anchorDay = user.billingAnchorDay ?? startDate.getUTCDate();
    const nextPaidUntil = addMonthsKeepingAnchor(startDate, 1, anchorDay);

    user.billingAnchorDay = anchorDay;
    user.paymentStatus = "paid";
    user.paymentExpiresAt = nextPaidUntil.toISOString();
    user.pendingPaystackReference = undefined;
  });

  return NextResponse.redirect(new URL("/admin?subscription=paid", request.url));
}
