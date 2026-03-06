import { NextRequest, NextResponse } from "next/server";
import { readDb } from "@/lib/db";
import { requireRole } from "@/lib/guards";
import { buildMikrotikScript } from "@/lib/mikrotik";

type Params = { params: Promise<{ id: string }> };

function normalizeFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 12);
}

export async function GET(request: NextRequest, context: Params) {
  const gate = await requireRole(request, "admin");
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const db = await readDb();
  const mikrotik = db.routers.find((router) => router.id === id);
  if (!mikrotik) {
    return NextResponse.json({ error: "MikroTik not found" }, { status: 404 });
  }
  if (gate.auth.role !== "super_admin" && mikrotik.createdBy !== gate.auth.sub) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const appBaseUrl = process.env.APP_BASE_URL ?? "https://wifi-billing-system-kappa.vercel.app";
  const script = buildMikrotikScript(mikrotik, appBaseUrl);
  const shortId = mikrotik.id.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toLowerCase();
  const fileName = `${normalizeFileName(mikrotik.name) || "mk"}-${shortId || "script"}.rsc`;

  return new NextResponse(script, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
