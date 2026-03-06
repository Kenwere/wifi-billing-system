import { NextRequest, NextResponse } from "next/server";
import { mutateDb } from "@/lib/db";
import { requireRole } from "@/lib/guards";
import { initializePaystackTransaction } from "@/lib/paystack";
import { computeMonthlyFee } from "@/lib/subscription";

function monthlyRevenueNow(payments: Array<{ status: string; date: string; amountKsh: number }>) {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = `${now.getUTCMonth() + 1}`.padStart(2, "0");
  return payments
    .filter((p) => p.status === "active" && p.date.startsWith(`${yyyy}-${mm}-`))
    .reduce((sum, p) => sum + p.amountKsh, 0);
}

export async function POST(request: NextRequest) {
  const gate = await requireRole(request, "admin");
  if (!gate.ok) return gate.response;
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? gate.auth.email ?? "").trim();
  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

  const result = await mutateDb(async (db) => {
    const me = db.adminUsers.find((u) => u.id === gate.auth.sub);
    if (!me) throw new Error("Unauthorized");
    const revenue = monthlyRevenueNow(db.payments.filter((p) => p.createdBy === gate.auth.sub));
    const amountKsh = computeMonthlyFee(revenue);
    const callbackUrl =
      process.env.PAYSTACK_CALLBACK_URL ??
      `${request.nextUrl.origin}/api/subscription/verify?adminId=${encodeURIComponent(me.id)}`;
    const reference = `sub_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    const initialized = await initializePaystackTransaction({
      email,
      amountKsh,
      callbackUrl,
      metadata: {
        adminId: me.id,
        type: "subscription",
        amountKsh,
      },
    });

    me.pendingPaystackReference = initialized.reference || reference;
    return {
      authorizationUrl: initialized.authorization_url,
      amountKsh,
      reference: initialized.reference || reference,
    };
  }).catch((error: Error) => error);

  if (result instanceof Error) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }
  return NextResponse.json(result);
}
