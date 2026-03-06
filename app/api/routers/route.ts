import { NextRequest, NextResponse } from "next/server";
import { mutateDb, readDb } from "@/lib/db";
import { requireRole } from "@/lib/guards";
import { disconnectInternetAccess } from "@/lib/mikrotik";
import { nowIso, randomId } from "@/lib/utils";

function autoAssignRouterHost(existingHosts: string[]): string {
  const used = new Set(existingHosts);
  for (let i = 1; i <= 254; i += 1) {
    const candidate = `192.168.88.${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `router-${Date.now()}.local`;
}

export async function GET(request: NextRequest) {
  const gate = await requireRole(request, "support");
  if (!gate.ok) return gate.response;
  const db = await readDb();
  // Filter by ownership: regular users see only their own routers, super_admin sees all
  const routers = gate.auth.role === "super_admin" 
    ? db.routers 
    : db.routers.filter((r) => r.createdBy === gate.auth.sub);
  return NextResponse.json({ routers });
}

export async function POST(request: NextRequest) {
  const gate = await requireRole(request, "admin");
  if (!gate.ok) return gate.response;
  const body = await request.json();
  const router = await mutateDb(async (db) => {
    if (gate.auth.role !== "super_admin") {
      const ownedCount = db.routers.filter((r) => r.createdBy === gate.auth.sub).length;
      if (ownedCount >= 1) {
        throw new Error("Admin accounts can add a maximum of 1 MikroTik");
      }
    }
    const hostFromBody = String(body.host ?? "").trim();
    const next = {
      id: randomId("router"),
      name: String(body.name ?? ""),
      location: String(body.location ?? ""),
      host: hostFromBody || autoAssignRouterHost(db.routers.map((r) => r.host)),
      apiPort: Number(body.apiPort ?? 8728),
      username: String(body.username ?? "admin"),
      password: String(body.password ?? "admin"),
      paymentDestination: body.paymentDestination ?? { enabledMethods: ["mpesa_till"] },
      setupOptions: {
        disableHotspotSharing: Boolean(body.setupOptions?.disableHotspotSharing ?? true),
        enableDeviceTracking: Boolean(body.setupOptions?.enableDeviceTracking ?? true),
        enableBandwidthControl: Boolean(body.setupOptions?.enableBandwidthControl ?? true),
        enableSessionLogging: Boolean(body.setupOptions?.enableSessionLogging ?? true),
      },
      active: true,
      createdBy: gate.auth.sub,
      createdAt: nowIso(),
    };
    if (!next.name) throw new Error("name is required");
    db.routers.push(next);
    return { router: next };
  }).catch((error: Error) => error);

  if (router instanceof Error) {
    return NextResponse.json({ error: router.message }, { status: 400 });
  }
  return NextResponse.json(router);
}

export async function PATCH(request: NextRequest) {
  const gate = await requireRole(request, "admin");
  if (!gate.ok) return gate.response;
  const body = await request.json();
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updated = await mutateDb((db) => {
    const router = db.routers.find((r) => r.id === id);
    if (!router) throw new Error("Router not found");
    // Check ownership: only creator or super_admin can update
    if (router.createdBy !== gate.auth.sub && gate.auth.role !== "super_admin") {
      throw new Error("You can only edit your own routers");
    }
    if (body.name !== undefined) router.name = String(body.name);
    if (body.location !== undefined) router.location = String(body.location);
    if (body.host !== undefined) router.host = String(body.host);
    if (body.apiPort !== undefined) router.apiPort = Number(body.apiPort);
    if (body.username !== undefined) router.username = String(body.username);
    if (body.password !== undefined) router.password = String(body.password);
    if (body.paymentDestination !== undefined) router.paymentDestination = body.paymentDestination;
    if (body.setupOptions !== undefined) {
      router.setupOptions = { ...router.setupOptions, ...body.setupOptions };
    }
    if (body.active !== undefined) router.active = Boolean(body.active);
    return router;
  }).catch((error: Error) => error);

  if (updated instanceof Error) {
    return NextResponse.json({ error: updated.message }, { status: 400 });
  }
  return NextResponse.json({ router: updated });
}

export async function DELETE(request: NextRequest) {
  const gate = await requireRole(request, "admin");
  if (!gate.ok) return gate.response;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const result = await mutateDb(async (db) => {
    const router = db.routers.find((r) => r.id === id);
    if (!router) throw new Error("MikroTik not found");
    // Check ownership: only creator or super_admin can delete
    if (router.createdBy !== gate.auth.sub && gate.auth.role !== "super_admin") {
      throw new Error("You can only delete your own routers");
    }

    const activeSessions = db.sessions.filter((s) => s.routerId === id && s.status === "active");
    for (const session of activeSessions) {
      session.status = "disconnected";
      session.manualTerminationReason = "mikrotik_deleted";
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

    const beforeRouters = db.routers.length;
    const beforePackages = db.packages.length;
    db.routers = db.routers.filter((r) => r.id !== id);
    db.packages = db.packages.filter((p) => p.routerId !== id);

    return {
      removedRouter: beforeRouters - db.routers.length,
      removedPackages: beforePackages - db.packages.length,
      disconnectedSessions: activeSessions.length,
    };
  }).catch((error: Error) => error);

  if (result instanceof Error) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ...result });
}
