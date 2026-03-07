import { mutateDb, readDb } from "@/lib/db";
import { disconnectInternetAccess, ensureUserInRestrictedList, grantInternetAccess } from "@/lib/mikrotik";
import { getRadiusServer } from "@/lib/radius";
import { PaymentMethod, Session } from "@/lib/types";
import {
  minutesFromNow,
  normalizeMac,
  nowIso,
  randomId,
  sanitizePhone,
  toDateParts,
} from "@/lib/utils";

export async function findReusableSession(input: {
  phone: string;
  macAddress: string;
  routerId: string;
}) {
  const db = await readDb();
  const phone = sanitizePhone(input.phone);
  const mac = normalizeMac(input.macAddress);
  const now = new Date();
  return db.sessions.find(
    (s) =>
      s.phone === phone &&
      s.macAddress === mac &&
      s.routerId === input.routerId &&
      s.status === "active" &&
      new Date(s.expiresAt) > now,
  );
}

export async function findReusableSessionByDevice(input: {
  macAddress: string;
  routerId: string;
}) {
  const db = await readDb();
  const mac = normalizeMac(input.macAddress);
  const now = new Date();
  return db.sessions.find(
    (s) =>
      s.macAddress === mac &&
      s.routerId === input.routerId &&
      s.status === "active" &&
      new Date(s.expiresAt) > now,
  );
}

export async function processPaymentAndActivateSession(input: {
  phone: string;
  macAddress: string;
  ipAddress: string;
  packageId: string;
  routerId: string;
  method: PaymentMethod;
}) {
  return mutateDb(async (db) => {
    const pkg = db.packages.find((p) => p.id === input.packageId && p.active);
    if (!pkg) throw new Error("Package not found");
    const router = db.routers.find((r) => r.id === input.routerId && r.active);
    if (!router) throw new Error("Router not found");
    const createdBy = router.createdBy;

    const phone = sanitizePhone(input.phone);
    const mac = normalizeMac(input.macAddress);
    const existing = db.hotspotUsers.find(
      (u) => u.phone === phone && u.macAddress === mac && u.createdBy === createdBy,
    );
    const user =
      existing ??
      (() => {
        const next = {
          id: randomId("usr"),
          phone,
          macAddress: mac,
          lastIp: input.ipAddress,
          createdBy,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        };
        db.hotspotUsers.push(next);
        return next;
      })();
    user.lastIp = input.ipAddress;
    user.updatedAt = nowIso();

    const session: Session = {
      id: randomId("sess"),
      userId: user.id,
      createdBy,
      routerId: router.id,
      packageId: pkg.id,
      phone,
      macAddress: mac,
      ipAddress: input.ipAddress,
      loginTime: nowIso(),
      expiresAt: minutesFromNow(pkg.durationMinutes),
      durationUsedMinutes: 0,
      status: "active",
      bytesIn: 0,
      bytesOut: 0,
    };
    db.sessions.push(session);

    const dateParts = toDateParts(nowIso());
    db.payments.push({
      id: randomId("pay"),
      createdBy,
      userPhone: phone,
      packageId: pkg.id,
      packageName: pkg.name,
      amountKsh: pkg.priceKsh,
      method: input.method,
      date: dateParts.date,
      time: dateParts.time,
      routerId: router.id,
      status: "active",
      sessionId: session.id,
      sessionExpiryTime: session.expiresAt,
      reference: randomId("ref"),
    });

    // Grant internet access to the user after payment
    try {
      await grantInternetAccess(router, session);
      console.log(`[Billing] Successfully granted internet access to ${input.ipAddress} on router ${router.id}`);
      
      // Cache session in RADIUS for WiFi authentication
      try {
        const radiusServer = getRadiusServer();
        // Use phone number as RADIUS username
        radiusServer.cacheSession(phone, session);
        console.log(`[Billing] Cached session in RADIUS server for ${phone}`);
      } catch (radiusError) {
        const radiusMsg = radiusError instanceof Error ? radiusError.message : String(radiusError);
        console.warn(`[Billing] Failed to cache session in RADIUS: ${radiusMsg}`);
        // Don't fail if RADIUS caching fails - it's optional
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Billing] Failed to grant internet access: ${errorMsg}`);
      // Log error but don't fail the payment - user can try reconnecting
      throw new Error(`Payment processed but internet access grant failed: ${errorMsg}`);
    }

    return {
      session,
      package: pkg,
      router,
    };
  });
}

export async function expireAndDisconnectSessions() {
  return mutateDb(async (db) => {
    const now = new Date();
    let expiredCount = 0;
    for (const session of db.sessions) {
      if (session.status !== "active") continue;
      if (new Date(session.expiresAt) > now) continue;
      session.status = "expired";
      session.logoutTime = nowIso();
      session.durationUsedMinutes = Math.max(
        0,
        Math.floor(
          (new Date(session.logoutTime).getTime() - new Date(session.loginTime).getTime()) /
            (1000 * 60),
        ),
      );
      const router = db.routers.find((r) => r.id === session.routerId);
      if (router) {
        try {
          await disconnectInternetAccess(router, session.macAddress);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.warn(`[Billing] Failed to disconnect session ${session.id} from router ${router.id}: ${errorMsg}`);
          // Continue processing other sessions even if disconnect fails
        }
      }
      expiredCount += 1;
    }
    return { expiredCount };
  });
}

export async function disconnectSession(
  sessionId: string,
  reason = "manual",
  actor?: { role: string; sub: string },
) {
  return mutateDb(async (db) => {
    const session = db.sessions.find((s) => s.id === sessionId);
    if (!session) throw new Error("Session not found");
    if (actor && actor.role !== "super_admin" && session.createdBy !== actor.sub) {
      throw new Error("Forbidden");
    }
    if (session.status !== "active") return session;
    session.status = "disconnected";
    session.manualTerminationReason = reason;
    session.logoutTime = nowIso();
    session.durationUsedMinutes = Math.max(
      0,
      Math.floor(
        (new Date(session.logoutTime).getTime() - new Date(session.loginTime).getTime()) /
          (1000 * 60),
      ),
    );
    const router = db.routers.find((r) => r.id === session.routerId);
    if (router) {
      try {
        await disconnectInternetAccess(router, session.macAddress);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(`[Billing] Failed to disconnect session ${sessionId}: ${errorMsg}`);
        // Continue - session status is already updated in database
      }
    }
    return session;
  });
}
