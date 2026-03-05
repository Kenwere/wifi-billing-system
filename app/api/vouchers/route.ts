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
  return NextResponse.json({ vouchers: db.vouchers });
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
    const next = {
      id: randomId("vch"),
      code: generateCode(),
      packageId,
      expiryDate,
      status: "unused" as const,
      sentToPhone,
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
