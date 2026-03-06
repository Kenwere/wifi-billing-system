import { NextRequest, NextResponse } from "next/server";
import { processPaymentAndActivateSession } from "@/lib/billing";
import { mutateDb, readDb } from "@/lib/db";
import { startStkPush } from "@/lib/mpesa";
import { initializePaystackTransaction } from "@/lib/paystack";
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
  const requestedMethod = String(body.method ?? "").trim() as PaymentMethod;
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
  const pkg = db.packages.find((p) => p.id === packageId && p.active);
  if (!pkg) return NextResponse.json({ error: "Package not found" }, { status: 404 });
  const router = db.routers.find((r) => r.id === routerId && r.active);
  if (!router) return NextResponse.json({ error: "Router not found" }, { status: 404 });
  const owner = db.adminUsers.find((u) => u.id === router.createdBy);
  const ownerLocked =
    !owner ||
    owner.paymentStatus === "overdue" ||
    new Date(owner.paymentExpiresAt).getTime() <= Date.now();
  if (ownerLocked) {
    return NextResponse.json(
      { error: "Service locked: unpaid subscription", reason: "Subscription payment overdue" },
      { status: 402 },
    );
  }
  if (pkg.createdBy !== router.createdBy) {
    return NextResponse.json({ error: "Package does not belong to this MikroTik" }, { status: 400 });
  }

  const enabledMethods = router.paymentDestination?.enabledMethods ?? [];
  if (requestedMethod && !enabledMethods.includes(requestedMethod)) {
    return NextResponse.json(
      { error: `Selected payment method '${requestedMethod}' is not enabled for this MikroTik.` },
      { status: 400 },
    );
  }
  const method = (requestedMethod || enabledMethods[0] || "mpesa_till") as PaymentMethod;

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
        createdBy: router.createdBy,
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
      method,
      message: mpesa.CustomerMessage ?? "M-Pesa prompt sent. Complete payment on phone.",
      checkoutRequestId: mpesa.CheckoutRequestID,
      merchantRequestId: mpesa.MerchantRequestID,
    });
  }

  if (method === "paystack") {
    const intentId = randomId("pint");
    const callbackUrl =
      process.env.PAYSTACK_PAYMENT_CALLBACK_URL ??
      `${request.nextUrl.origin}/api/payments/paystack/verify`;
    const digits = phone.replace(/\D/g, "");
    const email = String(body.email ?? `wifi-${digits || Date.now()}@moonconnect.app`).trim();

    const initialized = await initializePaystackTransaction({
      email,
      amountKsh: pkg.priceKsh,
      callbackUrl,
      metadata: {
        intentId,
        type: "package_payment",
        phone,
        macAddress,
        ipAddress,
        packageId,
        routerId,
      },
    }).catch((error: Error) => error);

    if (initialized instanceof Error) {
      return NextResponse.json({ error: initialized.message }, { status: 400 });
    }

    await mutateDb((current) => {
      current.paymentIntents.push({
        id: intentId,
        createdBy: router.createdBy,
        phone,
        macAddress,
        ipAddress,
        packageId,
        routerId,
        amountKsh: pkg.priceKsh,
        method,
        status: "pending",
        merchantRequestId: initialized.access_code,
        checkoutRequestId: initialized.reference,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    });

    return NextResponse.json({
      status: "pending",
      method,
      message: "Redirecting to Paystack checkout.",
      authorizationUrl: initialized.authorization_url,
      reference: initialized.reference,
    });
  }

  return NextResponse.json(
    {
      error: `Payment method '${method}' is not supported in checkout yet.`,
    },
    { status: 400 },
  );
}
