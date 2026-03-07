import { NextRequest, NextResponse } from "next/server";
import { expireAndDisconnectSessions } from "@/lib/billing";
import { readDb } from "@/lib/db";
import { requireRole } from "@/lib/guards";

export async function GET(request: NextRequest) {
  try {
    const gate = await requireRole(request, "support");
    if (!gate.ok) return gate.response;
    
    // Add timeout for session expiry check to prevent hanging
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Session expiry check timeout")), 10000)
    );
    
    try {
      await Promise.race([expireAndDisconnectSessions(), timeoutPromise]);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.warn(`[Sessions] Failed to expire and disconnect sessions: ${errorMsg}`);
      // Continue even if expiry check fails - return current session data
    }
    
    const db = await readDb();
    if (gate.auth.role === "super_admin") {
      return NextResponse.json({ sessions: db.sessions });
    }
    return NextResponse.json({
      sessions: db.sessions.filter((s) => s.createdBy === gate.auth.sub),
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[Sessions] API error: ${errorMsg}`);
    return NextResponse.json(
      { error: "Failed to fetch sessions" },
      { status: 500 }
    );
  }
}
