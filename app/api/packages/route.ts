import { NextRequest, NextResponse } from "next/server";
import { mutateDb, readDb } from "@/lib/db";
import { requireRole } from "@/lib/guards";
import { nowIso, randomId } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const gate = await requireRole(request, "support");
  if (!gate.ok) return gate.response;
  const routerId = request.nextUrl.searchParams.get("routerId");
  const db = await readDb();
  let items = routerId
    ? db.packages.filter((p) => p.routerId === routerId || p.routerId === "global")
    : db.packages;
  
  // Filter by ownership: regular users see only their own packages, super_admin sees all
  if (gate.auth.role !== "super_admin") {
    items = items.filter((p) => p.createdBy === gate.auth.sub);
  }
  
  return NextResponse.json({ packages: items });
}

export async function POST(request: NextRequest) {
  const gate = await requireRole(request, "operator");
  if (!gate.ok) return gate.response;
  const body = await request.json();
  const item = await mutateDb((db) => {
    const routerId = String(body.routerId ?? "global");
    if (routerId !== "global") {
      const router = db.routers.find((r) => r.id === routerId);
      if (!router) throw new Error("MikroTik not found");
      if (router.createdBy !== gate.auth.sub && gate.auth.role !== "super_admin") {
        throw new Error("You can only create packages for your own MikroTik");
      }
    }
    const next = {
      id: randomId("pkg"),
      routerId,
      name: String(body.name ?? ""),
      priceKsh: Number(body.priceKsh ?? 0),
      durationMinutes: Number(body.durationMinutes ?? 0),
      speedLimitKbps: body.speedLimitKbps ? Number(body.speedLimitKbps) : undefined,
      dataLimitMb: body.dataLimitMb ? Number(body.dataLimitMb) : undefined,
      validityHours: Number(body.validityHours ?? 24),
      active: true,
      createdBy: gate.auth.sub,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    if (!next.name || next.priceKsh <= 0 || next.durationMinutes <= 0) {
      throw new Error("name, priceKsh and durationMinutes are required");
    }
    db.packages.push(next);
    return next;
  }).catch((error: Error) => error);

  if (item instanceof Error) {
    return NextResponse.json({ error: item.message }, { status: 400 });
  }
  return NextResponse.json({ package: item });
}

export async function PATCH(request: NextRequest) {
  const gate = await requireRole(request, "operator");
  if (!gate.ok) return gate.response;
  const body = await request.json();
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updated = await mutateDb((db) => {
    const item = db.packages.find((p) => p.id === id);
    if (!item) throw new Error("Package not found");
    // Check ownership: only creator or super_admin can update
    if (item.createdBy !== gate.auth.sub && gate.auth.role !== "super_admin") {
      throw new Error("You can only edit your own packages");
    }
    if (body.name !== undefined) item.name = String(body.name);
    if (body.priceKsh !== undefined) item.priceKsh = Number(body.priceKsh);
    if (body.durationMinutes !== undefined) item.durationMinutes = Number(body.durationMinutes);
    if (body.speedLimitKbps !== undefined) {
      item.speedLimitKbps = body.speedLimitKbps ? Number(body.speedLimitKbps) : undefined;
    }
    if (body.dataLimitMb !== undefined) {
      item.dataLimitMb = body.dataLimitMb ? Number(body.dataLimitMb) : undefined;
    }
    if (body.validityHours !== undefined) item.validityHours = Number(body.validityHours);
    if (body.active !== undefined) item.active = Boolean(body.active);
    item.updatedAt = nowIso();
    return item;
  }).catch((error: Error) => error);
  if (updated instanceof Error) {
    return NextResponse.json({ error: updated.message }, { status: 400 });
  }
  return NextResponse.json({ package: updated });
}

export async function DELETE(request: NextRequest) {
  const gate = await requireRole(request, "admin");
  if (!gate.ok) return gate.response;
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  await mutateDb((db) => {
    const pkg = db.packages.find((p) => p.id === id);
    if (!pkg) throw new Error("Package not found");
    // Check ownership: only creator or super_admin can delete
    if (pkg.createdBy !== gate.auth.sub && gate.auth.role !== "super_admin") {
      throw new Error("You can only delete your own packages");
    }
    db.packages = db.packages.filter((p) => p.id !== id);
  });
  return NextResponse.json({ ok: true });
}
