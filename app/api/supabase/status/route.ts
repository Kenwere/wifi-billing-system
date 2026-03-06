import { NextRequest, NextResponse } from "next/server";
import { readDb } from "@/lib/db";
import { requireRole } from "@/lib/guards";

function hasSupabaseEnv() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function GET(request: NextRequest) {
  const gate = await requireRole(request, "support");
  if (!gate.ok) return gate.response;
  try {
    await readDb();
    return NextResponse.json({
      connected: hasSupabaseEnv(),
      mode: hasSupabaseEnv() ? "supabase" : "local-fallback",
      message: hasSupabaseEnv()
        ? "Supabase environment loaded and database read successful."
        : "Supabase env missing. Running with local JSON fallback.",
    });
  } catch (error) {
    return NextResponse.json(
      { connected: false, mode: "error", message: (error as Error).message },
      { status: 500 },
    );
  }
}
