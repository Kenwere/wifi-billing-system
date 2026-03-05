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
  if (!reference) {
    return NextResponse.json({ error: "reference is required" }, { status: 400 });
  }

  const verified = await verifyPaystackTransaction(reference).catch((error: Error) => error);
  if (verified instanceof Error) {
    return NextResponse.json({ error: verified.message }, { status: 400 });
  }

  if (verified.status !== "success") {
    return NextResponse.redirect(new URL("/admin?subscription=failed", request.url));
  }

  await mutateDb((db) => {
    const now = new Date();
    const currentPaidUntil = db.tenant.subscription.paidUntil
      ? new Date(db.tenant.subscription.paidUntil)
      : null;
    const startDate = currentPaidUntil && currentPaidUntil > now ? currentPaidUntil : now;
    const anchorDay = db.tenant.subscription.billingAnchorDay ?? startDate.getUTCDate();
    const nextPaidUntil = addMonthsKeepingAnchor(startDate, 1, anchorDay);

    db.tenant.subscription.billingAnchorDay = anchorDay;
    db.tenant.subscription.paidUntil = nextPaidUntil.toISOString();
    db.tenant.subscription.pendingPaystackReference = undefined;
    db.tenant.subscription.lockReason = undefined;
    db.adminUsers = db.adminUsers.map((user) => ({
      ...user,
      paymentStatus: "paid",
      paymentExpiresAt: nextPaidUntil.toISOString(),
    }));
  });

  return NextResponse.redirect(new URL("/admin?subscription=paid", request.url));
}
