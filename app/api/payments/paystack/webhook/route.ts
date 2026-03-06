import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { processPaymentAndActivateSession } from "@/lib/billing";
import { mutateDb, readDb } from "@/lib/db";
import { nowIso } from "@/lib/utils";

function isValidSignature(raw: string, signature: string | null): boolean {
  if (!signature) return false;
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return false;
  const hash = crypto.createHmac("sha512", secret).update(raw).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  const signature = request.headers.get("x-paystack-signature");
  if (!isValidSignature(raw, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(raw) as {
    event?: string;
    data?: { reference?: string; status?: string };
  };
  if (payload.event !== "charge.success") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const reference = String(payload.data?.reference ?? "");
  if (!reference) {
    return NextResponse.json({ error: "Missing reference" }, { status: 400 });
  }

  const db = await readDb();
  const intent = db.paymentIntents.find((i) => i.checkoutRequestId === reference && i.method === "paystack");
  if (!intent) return NextResponse.json({ ok: true, ignored: true });
  if (intent.status === "success") return NextResponse.json({ ok: true, alreadyProcessed: true });

  const activation = await processPaymentAndActivateSession({
    phone: intent.phone,
    macAddress: intent.macAddress,
    ipAddress: intent.ipAddress,
    packageId: intent.packageId,
    routerId: intent.routerId,
    method: "paystack",
  }).catch((error: Error) => error);

  if (activation instanceof Error) {
    await mutateDb((current) => {
      const item = current.paymentIntents.find((i) => i.id === intent.id);
      if (!item) return;
      item.status = "failed";
      item.resultDesc = activation.message;
      item.updatedAt = nowIso();
    });
    return NextResponse.json({ error: activation.message }, { status: 400 });
  }

  await mutateDb((current) => {
    const item = current.paymentIntents.find((i) => i.id === intent.id);
    if (!item) return;
    item.status = "success";
    item.resultDesc = "Paystack webhook verified";
    item.updatedAt = nowIso();
  });

  return NextResponse.json({ ok: true });
}
