import { NextRequest, NextResponse } from "next/server";
import { processPaymentAndActivateSession } from "@/lib/billing";
import { mutateDb, readDb } from "@/lib/db";
import { verifyPaystackTransaction } from "@/lib/paystack";
import { nowIso } from "@/lib/utils";

function redirectWithStatus(
  request: NextRequest,
  params: { routerId: string; status: "ok" | "failed"; message: string; phone?: string; macAddress?: string },
) {
  const destination =
    params.status === "ok"
      ? new URL(`/portal/${encodeURIComponent(params.routerId)}/connected`, request.nextUrl.origin)
      : new URL(`/portal/${encodeURIComponent(params.routerId)}/checkout`, request.nextUrl.origin);
  destination.searchParams.set("status", params.status);
  destination.searchParams.set("message", params.message);
  if (params.phone) destination.searchParams.set("phone", params.phone);
  if (params.macAddress) destination.searchParams.set("mac", params.macAddress);
  return NextResponse.redirect(destination);
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
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
    return redirectWithStatus(request, {
      routerId: intent.routerId,
      status: "ok",
      message: "Payment verified. Internet connected.",
      phone: intent.phone,
      macAddress: intent.macAddress,
    });
  }

  // Give webhook a short chance to complete first to avoid extra verification delay.
  for (let i = 0; i < 5; i += 1) {
    const latest = await readDb();
    const latestIntent = latest.paymentIntents.find((it) => it.id === intent.id);
    if (latestIntent?.status === "success") {
      return redirectWithStatus(request, {
        routerId: latestIntent.routerId,
        status: "ok",
        message: "Payment verified. Internet connected.",
        phone: latestIntent.phone,
        macAddress: latestIntent.macAddress,
      });
    }
    await sleep(500);
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
    return redirectWithStatus(request, {
      routerId: intent.routerId,
      status: "failed",
      message: verified.message,
      phone: intent.phone,
      macAddress: intent.macAddress,
    });
  }

  if (verified.status !== "success") {
    await mutateDb((current) => {
      const item = current.paymentIntents.find((i) => i.id === intent.id);
      if (!item) return;
      item.status = "failed";
      item.resultDesc = `Paystack status: ${verified.status}`;
      item.updatedAt = nowIso();
    });
    return redirectWithStatus(request, {
      routerId: intent.routerId,
      status: "failed",
      message: "Payment not successful.",
      phone: intent.phone,
      macAddress: intent.macAddress,
    });
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
    return redirectWithStatus(request, {
      routerId: intent.routerId,
      status: "failed",
      message: activation.message,
      phone: intent.phone,
      macAddress: intent.macAddress,
    });
  }

  await mutateDb((current) => {
    const item = current.paymentIntents.find((i) => i.id === intent.id);
    if (!item) return;
    item.status = "success";
    item.resultDesc = "Paystack verified";
    item.updatedAt = nowIso();
  });

  return redirectWithStatus(request, {
    routerId: intent.routerId,
    status: "ok",
    message: "Payment verified. Internet connected.",
    phone: intent.phone,
    macAddress: intent.macAddress,
  });
}
