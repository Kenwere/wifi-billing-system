import { NextRequest, NextResponse } from "next/server";
import { readDb } from "@/lib/db";
import { requireRole } from "@/lib/guards";

function hasFirebaseEnv() {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY,
  );
}

export async function GET(request: NextRequest) {
  const gate = await requireRole(request, "support");
  if (!gate.ok) return gate.response;
  try {
    await readDb();
    return NextResponse.json({
      connected: hasFirebaseEnv(),
      mode: hasFirebaseEnv() ? "firebase" : "local-fallback",
      message: hasFirebaseEnv()
        ? "Firebase environment loaded and database read successful."
        : "Firebase env missing. Running with local JSON fallback.",
    });
  } catch (error) {
    return NextResponse.json(
      { connected: false, mode: "error", message: (error as Error).message },
      { status: 500 },
    );
  }
}
