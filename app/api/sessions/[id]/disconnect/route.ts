import { NextRequest, NextResponse } from "next/server";
import { disconnectSession } from "@/lib/billing";
import { requireRole } from "@/lib/guards";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Params) {
  const gate = await requireRole(request, "operator");
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const result = await disconnectSession(id).catch((error: Error) => error);
  if (result instanceof Error) {
    return NextResponse.json({ error: result.message }, { status: 404 });
  }
  return NextResponse.json({ session: result });
}
