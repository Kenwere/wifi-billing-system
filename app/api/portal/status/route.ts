import { NextRequest, NextResponse } from "next/server";
import { expireAndDisconnectSessions, findReusableSession, findReusableSessionByDevice } from "@/lib/billing";
import { readDb } from "@/lib/db";
import { grantInternetAccess } from "@/lib/mikrotik";
import { subscriptionState } from "@/lib/subscription";
import { normalizeMac, sanitizePhone } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const routerId = request.nextUrl.searchParams.get("routerId") ?? "";
  const phone = request.nextUrl.searchParams.get("phone") ?? "";
  const macAddress =
    request.nextUrl.searchParams.get("macAddress") ?? request.nextUrl.searchParams.get("mac") ?? "";

  await expireAndDisconnectSessions();

  const db = await readDb();
  const router = db.routers.find((r) => r.id === routerId && r.active);
  if (!router) {
    return NextResponse.json({ error: "Router not found" }, { status: 404 });
  }
  const subscription = subscriptionState(db);
  const effectiveRouterId = router.id;
  const packages = db.packages.filter(
    (p) =>
      p.active &&
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
  if (activeSession) {
    await grantInternetAccess(router, activeSession).catch(() => null);
    autoConnected = true;
  }

  return NextResponse.json({
    tenant: db.tenant,
    router,
    packages,
    subscription,
    activeSession,
    autoConnected,
  });
}
