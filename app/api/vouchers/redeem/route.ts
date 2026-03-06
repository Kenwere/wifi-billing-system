import { NextRequest, NextResponse } from "next/server";
import { mutateDb } from "@/lib/db";
import { processPaymentAndActivateSession } from "@/lib/billing";
import { disconnectInternetAccess } from "@/lib/mikrotik";
import { normalizeMac, sanitizePhone } from "@/lib/utils";
import crypto from "crypto";
import { nowIso } from "@/lib/utils";

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

  const voucher = await mutateDb(async (db) => {
    const itemIndex = db.vouchers.findIndex((v) => v.code === code);
    if (itemIndex < 0) throw new Error("Voucher not found");
    const item = db.vouchers[itemIndex];
    if (!item) throw new Error("Voucher not found");
    if (item.status === "inactive") throw new Error("Voucher is deactivated");
    if (new Date(item.expiryDate) < new Date()) throw new Error("Voucher expired");

    const router = db.routers.find((r) => r.id === routerId);
    if (!router) throw new Error("Router not found");
    if (item.createdBy !== router.createdBy) {
      throw new Error("Voucher does not belong to this MikroTik");
    }

    const activeSessions = db.sessions.filter(
      (s) => s.routerId === routerId && s.phone === phone && s.status === "active",
    );
    for (const session of activeSessions) {
      session.status = "disconnected";
      session.manualTerminationReason = "voucher_reset";
      session.logoutTime = nowIso();
      session.durationUsedMinutes = Math.max(
        0,
        Math.floor(
          (new Date(session.logoutTime).getTime() - new Date(session.loginTime).getTime()) /
            (1000 * 60),
        ),
      );
      await disconnectInternetAccess(router, session.macAddress);
    }

    const knownUser = db.hotspotUsers
      .filter((u) => u.phone === phone && u.createdBy === router.createdBy)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
    const lastSession = db.sessions
      .filter((s) => s.routerId === routerId && s.phone === phone)
      .sort((a, b) => new Date(b.loginTime).getTime() - new Date(a.loginTime).getTime())[0];

    const resolvedMac = rawMac
      ? normalizeMac(rawMac)
      : normalizeMac(lastSession?.macAddress || knownUser?.macAddress || macAddress);
    const resolvedIp = ipAddress || lastSession?.ipAddress || knownUser?.lastIp || "0.0.0.0";

    const packageId = item.packageId;
    db.vouchers.splice(itemIndex, 1);
    return { packageId, macAddress: resolvedMac, ipAddress: resolvedIp };
  }).catch((error: Error) => error);

  if (voucher instanceof Error) {
    return NextResponse.json({ error: voucher.message }, { status: 400 });
  }

  const result = await processPaymentAndActivateSession({
    phone,
    macAddress: voucher.macAddress,
    ipAddress: voucher.ipAddress,
    packageId: voucher.packageId,
    routerId,
    method: "other",
  }).catch((error: Error) => error);

  if (result instanceof Error) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }
  return NextResponse.json({ message: "Voucher redeemed", session: result.session });
}
