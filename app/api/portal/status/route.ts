import { NextRequest, NextResponse } from "next/server";
import { expireAndDisconnectSessions, findReusableSession, findReusableSessionByDevice } from "@/lib/billing";
import { readDb } from "@/lib/db";
import { grantInternetAccess, ensureUserInRestrictedList } from "@/lib/mikrotik";
import { normalizeMac, sanitizePhone } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const routerId = request.nextUrl.searchParams.get("routerId") ?? "";
  const phone = request.nextUrl.searchParams.get("phone") ?? "";
  const macAddress =
    request.nextUrl.searchParams.get("macAddress") ?? request.nextUrl.searchParams.get("mac") ?? "";
  const clientIp = request.nextUrl.searchParams.get("ip") ?? "";

  // Run session expiry check in background to avoid blocking the response
  expireAndDisconnectSessions().catch((err) => console.error("Session expiry error:", err));

  const db = await readDb();
  const router = db.routers.find((r) => r.id === routerId && r.active);
  if (!router) {
    return NextResponse.json({ error: "Router not found" }, { status: 404 });
  }
  const owner = db.adminUsers.find((u) => u.id === router.createdBy);
  const subscription = owner
    ? {
        locked: owner.paymentStatus === "overdue" || new Date(owner.paymentExpiresAt) <= new Date(),
        reason:
          owner.paymentStatus === "overdue" || new Date(owner.paymentExpiresAt) <= new Date()
            ? "Subscription payment overdue"
            : undefined,
      }
    : { locked: false as const, reason: undefined };
  const effectiveRouterId = router.id;
  const packages = db.packages.filter(
    (p) =>
      p.active &&
      p.createdBy === router.createdBy &&
      (p.routerId === effectiveRouterId || p.routerId === "global" || p.routerId === ""),
  );

  const byPhoneAndMac =
    phone && macAddress
      ? await findReusableSession({
          phone: sanitizePhone(phone),
          macAddress: normalizeMac(macAddress),
          routerId,
        })
      : null;
  const byDeviceOnly = !byPhoneAndMac && macAddress
    ? await findReusableSessionByDevice({ macAddress: normalizeMac(macAddress), routerId })
    : null;

  const activeSession = byPhoneAndMac ?? byDeviceOnly;
  let autoConnected = false;
  if (!subscription.locked && activeSession) {
    await grantInternetAccess(router, activeSession).catch(() => null);
    autoConnected = true;
  } else if (macAddress && clientIp) {
    // New user - ensure they're in restricted list for captive portal
    await ensureUserInRestrictedList(router, clientIp).catch(() => null);
  }

  return NextResponse.json({
    tenant: {
      ...db.tenant,
      businessName: owner?.businessName || db.tenant.businessName,
      businessLogoUrl: owner?.businessLogoUrl || db.tenant.businessLogoUrl,
    },
    router,
    packages,
    subscription,
    activeSession: subscription.locked ? null : activeSession,
    autoConnected,
  });
}
