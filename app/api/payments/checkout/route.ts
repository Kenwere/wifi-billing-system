import { NextRequest, NextResponse } from "next/server";
import { processPaymentAndActivateSession } from "@/lib/billing";
import { mutateDb, readDb } from "@/lib/db";
import { startStkPush } from "@/lib/mpesa";
import { subscriptionState } from "@/lib/subscription";
import { PaymentMethod } from "@/lib/types";
import { normalizeMac, nowIso, randomId } from "@/lib/utils";
import crypto from "crypto";

function buildPseudoMac(seed: string): string {
  const hash = crypto.createHash("sha256").update(seed).digest("hex");
  const bytes = [
    "02",
    hash.slice(0, 2),
    hash.slice(2, 4),
    hash.slice(4, 6),
    hash.slice(6, 8),
    hash.slice(8, 10),
  ];
  return bytes.join(":").toUpperCase();
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const method = String(body.method ?? "mpesa_till") as PaymentMethod;
  const phone = String(body.phone ?? "");
  const macBody = String(body.macAddress ?? "");
  const macQuery = request.nextUrl.searchParams.get("macAddress") ?? request.nextUrl.searchParams.get("mac") ?? "";
  const rawMac = macBody || macQuery;
  const forwarded = request.headers.get("x-forwarded-for");
  const inferredIp = forwarded?.split(",")[0]?.trim() || "0.0.0.0";
  const ipAddress = String(body.ipAddress ?? inferredIp);
  const packageId = String(body.packageId ?? "");
  const routerId = String(body.routerId ?? "");
  if (!phone || !packageId || !routerId) {
    return NextResponse.json(
      { error: "phone, packageId and routerId are required" },
      { status: 400 },
    );
  }
  const macAddress = rawMac
    ? normalizeMac(rawMac)
    : buildPseudoMac(`${phone}|${routerId}|${ipAddress}|${request.headers.get("user-agent") ?? ""}`);

  const db = await readDb();
  const state = subscriptionState(db);
  if (state.locked) {
    return NextResponse.json(
      { error: "Service locked: unpaid subscription", reason: state.reason },
      { status: 402 },
    );
  }

  const pkg = db.packages.find((p) => p.id === packageId && p.active);
  if (!pkg) return NextResponse.json({ error: "Package not found" }, { status: 404 });

  if (method === "mpesa_till" || method === "mpesa_paybill" || method === "mpesa_phone") {
    const intentId = randomId("pint");
    const simulated = process.env.MPESA_SIMULATE === "true";

    if (simulated) {
      const result = await processPaymentAndActivateSession({
        phone,
        macAddress,
        ipAddress,
        packageId,
        routerId,
        method,
      }).catch((error: Error) => error);

      if (result instanceof Error) {
        return NextResponse.json({ error: result.message }, { status: 400 });
      }
      return NextResponse.json({
        status: "connected",
        message: "Simulation mode: payment auto-approved and internet granted",
        session: result.session,
      });
    }

    const mpesa = await startStkPush({
      phone,
      amountKsh: pkg.priceKsh,
      accountReference: pkg.name,
      transactionDesc: `WiFi ${pkg.name}`,
      method,
    }).catch((error: Error) => error);

    if (mpesa instanceof Error) {
      return NextResponse.json({ error: mpesa.message }, { status: 400 });
    }

    await mutateDb((current) => {
      current.paymentIntents.push({
        id: intentId,
        phone,
        macAddress,
        ipAddress,
        packageId,
        routerId,
        amountKsh: pkg.priceKsh,
        method,
        status: "pending",
        merchantRequestId: mpesa.MerchantRequestID,
        checkoutRequestId: mpesa.CheckoutRequestID,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    });

    return NextResponse.json({
      status: "pending",
      message: mpesa.CustomerMessage ?? "M-Pesa prompt sent. Complete payment on phone.",
      checkoutRequestId: mpesa.CheckoutRequestID,
      merchantRequestId: mpesa.MerchantRequestID,
    });
  }

  return NextResponse.json(
    {
      error:
        "Selected payment method is not enabled for live auto-activation yet. Use M-Pesa methods or implement Paystack verification flow before go-live.",
    },
    { status: 400 },
  );
}
