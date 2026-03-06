import { NextRequest, NextResponse } from "next/server";
import { disconnectSession } from "@/lib/billing";
import { requireRole } from "@/lib/guards";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Params) {
  const gate = await requireRole(request, "operator");
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const result = await disconnectSession(id, "manual", gate.auth).catch((error: Error) => error);
  if (result instanceof Error) {
    const status = result.message === "Forbidden" ? 403 : 404;
    return NextResponse.json({ error: result.message }, { status });
  }
  return NextResponse.json({ session: result });
}
