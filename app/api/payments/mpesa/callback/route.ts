import { NextRequest, NextResponse } from "next/server";
import { processPaymentAndActivateSession } from "@/lib/billing";
import { mutateDb, readDb } from "@/lib/db";
import { parseStkCallback } from "@/lib/mpesa";
import { nowIso } from "@/lib/utils";

export async function POST(request: NextRequest) {
  const payload = await request.json();
  const callback = parseStkCallback(payload);
  if (!callback.checkoutRequestId) {
    return NextResponse.json({ ResultCode: 1, ResultDesc: "Missing CheckoutRequestID" }, { status: 400 });
  }

  const db = await readDb();
  const intent = db.paymentIntents.find((i) => i.checkoutRequestId === callback.checkoutRequestId);
  if (!intent) {
    return NextResponse.json({ ResultCode: 1, ResultDesc: "Payment intent not found" }, { status: 404 });
  }
  if (intent.status === "success") {
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Already processed" });
  }

  if (callback.resultCode !== 0) {
    await mutateDb((current) => {
      const item = current.paymentIntents.find((i) => i.id === intent.id);
      if (!item) return;
      item.status = "failed";
      item.resultCode = callback.resultCode;
      item.resultDesc = callback.resultDesc;
      item.updatedAt = nowIso();
    });
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Failed payment acknowledged" });
  }

  const activation = await processPaymentAndActivateSession({
    phone: intent.phone,
    macAddress: intent.macAddress,
    ipAddress: intent.ipAddress,
    packageId: intent.packageId,
    routerId: intent.routerId,
    method: intent.method,
  }).catch((error: Error) => error);

  if (activation instanceof Error) {
    return NextResponse.json({ ResultCode: 1, ResultDesc: activation.message }, { status: 400 });
  }

  await mutateDb((current) => {
    const item = current.paymentIntents.find((i) => i.id === intent.id);
    if (!item) return;
    item.status = "success";
    item.resultCode = callback.resultCode;
    item.resultDesc = callback.resultDesc;
    item.updatedAt = nowIso();
  });

  return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
}
