import { NextRequest, NextResponse } from "next/server";
import { mutateDb } from "@/lib/db";
import { processPaymentAndActivateSession } from "@/lib/billing";
import { sanitizePhone } from "@/lib/utils";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const code = String(body.code ?? "").toUpperCase().trim();
  const phone = sanitizePhone(String(body.phone ?? ""));
  const macAddress = String(body.macAddress ?? "");
  const forwarded = request.headers.get("x-forwarded-for");
  const inferredIp = forwarded?.split(",")[0]?.trim() || "0.0.0.0";
  const ipAddress = String(body.ipAddress ?? inferredIp);
  const routerId = String(body.routerId ?? "");
  if (!code || !phone || !macAddress || !routerId) {
    return NextResponse.json(
      { error: "code, phone, macAddress, routerId are required" },
      { status: 400 },
    );
  }

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
