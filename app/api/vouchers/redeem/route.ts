import { NextRequest, NextResponse } from "next/server";
import { mutateDb } from "@/lib/db";
import { processPaymentAndActivateSession } from "@/lib/billing";
import { normalizeMac, sanitizePhone } from "@/lib/utils";
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
  const code = String(body.code ?? "").toUpperCase().trim();
  const phone = sanitizePhone(String(body.phone ?? ""));
  const macBody = String(body.macAddress ?? "");
  const macQuery = request.nextUrl.searchParams.get("macAddress") ?? request.nextUrl.searchParams.get("mac") ?? "";
  const rawMac = macBody || macQuery;
  const forwarded = request.headers.get("x-forwarded-for");
  const inferredIp = forwarded?.split(",")[0]?.trim() || "0.0.0.0";
  const ipAddress = String(body.ipAddress ?? inferredIp);
  const routerId = String(body.routerId ?? "");
  if (!code || !phone || !routerId) {
    return NextResponse.json(
      { error: "code, phone, routerId are required" },
      { status: 400 },
    );
  }
  const macAddress = rawMac
    ? normalizeMac(rawMac)
    : buildPseudoMac(`${phone}|${routerId}|${ipAddress}|${request.headers.get("user-agent") ?? ""}`);

  const voucher = await mutateDb((db) => {
    const item = db.vouchers.find((v) => v.code === code);
    if (!item) throw new Error("Voucher not found");
    if (item.status === "used") throw new Error("Voucher already used");
    if (new Date(item.expiryDate) < new Date()) throw new Error("Voucher expired");
    item.status = "used";
    item.usedByPhone = phone;
    item.usedAt = new Date().toISOString();
    return item;
  }).catch((error: Error) => error);

  if (voucher instanceof Error) {
    return NextResponse.json({ error: voucher.message }, { status: 400 });
  }

  const result = await processPaymentAndActivateSession({
    phone,
    macAddress,
    ipAddress,
    packageId: voucher.packageId,
    routerId,
    method: "other",
  }).catch((error: Error) => error);

  if (result instanceof Error) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }
  return NextResponse.json({ message: "Voucher redeemed", session: result.session });
}
