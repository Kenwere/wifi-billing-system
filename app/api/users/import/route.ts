import { NextRequest, NextResponse } from "next/server";
import { mutateDb } from "@/lib/db";
import { requireRole } from "@/lib/guards";
import { HotspotUser } from "@/lib/types";
import { normalizeMac, nowIso, randomId, sanitizePhone } from "@/lib/utils";

function normalizeIncomingUsers(raw: unknown): HotspotUser[] {
  const source =
    raw && typeof raw === "object" && "users" in (raw as Record<string, unknown>)
      ? (raw as { users?: unknown }).users
      : raw;
  if (!Array.isArray(source)) {
    throw new Error("Invalid payload. Expected an array or { users: [] }");
  }

  return source.map((item, index) => {
    const row = item as Record<string, unknown>;
    const phone = sanitizePhone(String(row.phone ?? ""));
    const macAddress = normalizeMac(String(row.macAddress ?? ""));
    const lastIp = String(row.lastIp ?? "");
    if (!phone || !macAddress) {
      throw new Error(`Invalid user at index ${index}. phone and macAddress are required.`);
    }
    return {
      id: typeof row.id === "string" && row.id ? row.id : randomId("usr"),
      phone,
      macAddress,
      lastIp: lastIp || "0.0.0.0",
      createdAt: typeof row.createdAt === "string" && row.createdAt ? row.createdAt : nowIso(),
      updatedAt: nowIso(),
    };
  });
}

export async function POST(request: NextRequest) {
  const gate = await requireRole(request, "admin");
  if (!gate.ok) return gate.response;

  const body = await request.json().catch(() => ({}));
  const mode = String(body.mode ?? "merge").toLowerCase();
  if (!["merge", "replace"].includes(mode)) {
    return NextResponse.json({ error: "mode must be merge or replace" }, { status: 400 });
  }

  let incoming: HotspotUser[];
  try {
    incoming = normalizeIncomingUsers(body.payload ?? body.users ?? body);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }

  const result = await mutateDb((db) => {
    const before = db.hotspotUsers.length;
    const keyed = new Map<string, HotspotUser>();
    if (mode === "merge") {
      for (const user of db.hotspotUsers) {
        keyed.set(`${user.phone}|${user.macAddress}`, user);
      }
    }
    for (const user of incoming) {
      keyed.set(`${user.phone}|${user.macAddress}`, user);
    }
    db.hotspotUsers = Array.from(keyed.values());
    return {
      before,
      imported: incoming.length,
      after: db.hotspotUsers.length,
      mode,
    };
  }).catch((error: Error) => error);

  if (result instanceof Error) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json(result);
}
