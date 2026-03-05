import { NextRequest, NextResponse } from "next/server";
import { mutateDb } from "@/lib/db";
import { requireRole } from "@/lib/guards";
import { setupRouter } from "@/lib/mikrotik";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Params) {
  const gate = await requireRole(request, "admin");
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const result = await mutateDb(async (db) => {
    const router = db.routers.find((r) => r.id === id);
    if (!router) throw new Error("Router not found");
    return setupRouter(router);
  }).catch((error: Error) => error);

  if (result instanceof Error) {
    return NextResponse.json({ error: result.message }, { status: 404 });
  }
  return NextResponse.json(result);
}
