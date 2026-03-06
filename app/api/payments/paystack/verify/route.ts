import { NextRequest, NextResponse } from "next/server";
import { processPaymentAndActivateSession } from "@/lib/billing";
import { mutateDb, readDb } from "@/lib/db";
import { verifyPaystackTransaction } from "@/lib/paystack";
import { nowIso } from "@/lib/utils";

function redirectWithStatus(request: NextRequest, routerId: string, status: "ok" | "failed", message: string) {
  const destination = new URL(`/portal/${encodeURIComponent(routerId)}/checkout`, request.nextUrl.origin);
  destination.searchParams.set("status", status);
  destination.searchParams.set("message", message);
  return NextResponse.redirect(destination);
}

export async function GET(request: NextRequest) {
  const reference = request.nextUrl.searchParams.get("reference");
  if (!reference) {
    return NextResponse.json({ error: "Missing reference" }, { status: 400 });
  }

  const db = await readDb();
  const intent = db.paymentIntents.find((i) => i.checkoutRequestId === reference && i.method === "paystack");
  if (!intent) {
    return NextResponse.json({ error: "Payment intent not found" }, { status: 404 });
  }
  if (intent.status === "success") {
    return redirectWithStatus(request, intent.routerId, "ok", "Payment already verified.");
  }

  const verified = await verifyPaystackTransaction(reference).catch((error: Error) => error);
  if (verified instanceof Error) {
    await mutateDb((current) => {
      const item = current.paymentIntents.find((i) => i.id === intent.id);
      if (!item) return;
      item.status = "failed";
      item.resultDesc = verified.message;
      item.updatedAt = nowIso();
    });
    return redirectWithStatus(request, intent.routerId, "failed", verified.message);
  }

  if (verified.status !== "success") {
    await mutateDb((current) => {
      const item = current.paymentIntents.find((i) => i.id === intent.id);
      if (!item) return;
      item.status = "failed";
      item.resultDesc = `Paystack status: ${verified.status}`;
      item.updatedAt = nowIso();
    });
    return redirectWithStatus(request, intent.routerId, "failed", "Payment not successful.");
  }

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
    return redirectWithStatus(request, intent.routerId, "failed", activation.message);
  }

  await mutateDb((current) => {
    const item = current.paymentIntents.find((i) => i.id === intent.id);
    if (!item) return;
    item.status = "success";
    item.resultDesc = "Paystack verified";
    item.updatedAt = nowIso();
  });

  return redirectWithStatus(request, intent.routerId, "ok", "Payment verified. Internet connected.");
}
