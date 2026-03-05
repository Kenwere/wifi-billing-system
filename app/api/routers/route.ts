import { NextRequest, NextResponse } from "next/server";
import { mutateDb, readDb } from "@/lib/db";
import { requireRole } from "@/lib/guards";
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
  return NextResponse.json({ routers: db.routers });
}

export async function POST(request: NextRequest) {
  const gate = await requireRole(request, "admin");
  if (!gate.ok) return gate.response;
  const body = await request.json();
  const router = await mutateDb(async (db) => {
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
