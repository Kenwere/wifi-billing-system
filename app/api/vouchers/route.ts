import { NextRequest, NextResponse } from "next/server";
import { mutateDb, readDb } from "@/lib/db";
import { requireRole } from "@/lib/guards";
import { nowIso, randomId } from "@/lib/utils";

function generateCode(): string {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

export async function GET(request: NextRequest) {
  const gate = await requireRole(request, "support");
  if (!gate.ok) return gate.response;
  const db = await readDb();
  // Filter by ownership: regular users see only their own vouchers, super_admin sees all
  let vouchers = db.vouchers.filter((v) => v.status !== "used");
  if (gate.auth.role !== "super_admin") {
    vouchers = vouchers.filter((v) => v.createdBy === gate.auth.sub);
  }
  return NextResponse.json({ vouchers });
}

export async function POST(request: NextRequest) {
  const gate = await requireRole(request, "operator");
  if (!gate.ok) return gate.response;
  const body = await request.json();
  const packageId = String(body.packageId ?? "");
  const expiryDate = String(body.expiryDate ?? "");
  const sentToPhone = body.sentToPhone ? String(body.sentToPhone) : undefined;
  if (!packageId || !expiryDate) {
    return NextResponse.json({ error: "packageId and expiryDate are required" }, { status: 400 });
  }
  const voucher = await mutateDb((db) => {
    const pkg = db.packages.find((p) => p.id === packageId);
    if (!pkg) throw new Error("Package not found");
    // Ensure user can only create vouchers for their own packages
    if (pkg.createdBy !== gate.auth.sub && gate.auth.role !== "super_admin") {
      throw new Error("You can only create vouchers for your own packages");
    }
    const next = {
      id: randomId("vch"),
      code: generateCode(),
      packageId,
      expiryDate,
      status: "unused" as const,
      sentToPhone,
      createdBy: gate.auth.sub,
      createdAt: nowIso(),
    };
    db.vouchers.push(next);
    return next;
  }).catch((error: Error) => error);
  if (voucher instanceof Error) {
    return NextResponse.json({ error: voucher.message }, { status: 400 });
  }
  return NextResponse.json({ voucher });
}

export async function PATCH(request: NextRequest) {
  const gate = await requireRole(request, "operator");
  if (!gate.ok) return gate.response;
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const action = String(body.action ?? "").toLowerCase();
  if (!id || !["deactivate", "activate"].includes(action)) {
    return NextResponse.json({ error: "id and valid action are required" }, { status: 400 });
  }

  const updated = await mutateDb((db) => {
    const voucher = db.vouchers.find((v) => v.id === id);
    if (!voucher) throw new Error("Voucher not found");
    // Check ownership: only creator or super_admin can update
    if (voucher.createdBy !== gate.auth.sub && gate.auth.role !== "super_admin") {
      throw new Error("You can only edit your own vouchers");
    }
    if (voucher.status === "used") throw new Error("Used vouchers are removed automatically");
    voucher.status = action === "deactivate" ? "inactive" : "unused";
    return voucher;
  }).catch((error: Error) => error);

  if (updated instanceof Error) {
    return NextResponse.json({ error: updated.message }, { status: 400 });
  }
  return NextResponse.json({ voucher: updated });
}

export async function DELETE(request: NextRequest) {
  const gate = await requireRole(request, "operator");
  if (!gate.ok) return gate.response;
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const deleted = await mutateDb((db) => {
    const voucher = db.vouchers.find((v) => v.id === id);
    if (!voucher) throw new Error("Voucher not found");
    // Check ownership: only creator or super_admin can delete
    if (voucher.createdBy !== gate.auth.sub && gate.auth.role !== "super_admin") {
      throw new Error("You can only delete your own vouchers");
    }
    const before = db.vouchers.length;
    db.vouchers = db.vouchers.filter((v) => v.id !== id);
    if (db.vouchers.length === before) throw new Error("Voucher not found");
    return { deleted: true };
  }).catch((error: Error) => error);

  if (deleted instanceof Error) {
    return NextResponse.json({ error: deleted.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
