import { NextRequest, NextResponse } from "next/server";
import { readDb } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

/**
 * MikroTik polling endpoint (CGNAT-compatible)
 * 
 * MikroTik periodically calls this endpoint to get a list of commands
 * to execute for activating paid users.
 * 
 * This solves the CGNAT problem: MikroTik initiates the connection,
 * so no port forwarding is needed on the ISP side.
 * 
 * Query params:
 *   - format=commands: Returns executable MikroTik script commands
 *   - format=json: Returns structured data (default)
 */
export async function GET(
  request: NextRequest,
  context: Params,
) {
  const { id: routerId } = await context.params;
  
  if (!routerId) {
    return NextResponse.json({ error: "Router ID required" }, { status: 400 });
  }

  const format = (request.nextUrl.searchParams.get("format") || "json").toLowerCase();

  try {
    const db = await readDb();
    const router = db.routers.find((r) => r.id === routerId && r.active);
    if (!router) {
      return NextResponse.json({ error: "Router not found" }, { status: 404 });
    }

    // Get all active sessions created in the last 5 minutes
    // These are recently-paid users that need activation
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;

    const pendingActivations = db.sessions.filter((session) => {
      if (session.routerId !== routerId) return false;
      if (session.status !== "active") return false;

      const loginTime = new Date(session.loginTime).getTime();
      return loginTime >= fiveMinutesAgo;
    });

    // Remove duplicates based on IP and MAC
    const uniqueIps = [...new Set(
      pendingActivations
        .map((s) => s.ipAddress)
        .filter((ip): ip is string => Boolean(ip && ip !== "0.0.0.0"))
    )];

    const uniqueMacs = [...new Set(
      pendingActivations
        .map((s) => s.macAddress)
        .filter((mac): mac is string => Boolean(mac))
    )];

    if (format === "commands") {
      // Return MikroTik script commands that can be executed directly
      const commands: string[] = [];

      // Add commands for IP-based activation (firewall method)
      for (const ip of uniqueIps) {
        commands.push(
          `# Activate IP ${ip}`,
          `/ip firewall address-list remove [/ip/firewall/address-list find where list=wifi-billing-restricted and address=${ip}]`,
          `/ip firewall address-list add list=wifi-billing-active address=${ip} comment="auto:${routerId}"`,
        );
      }

      // Add commands for MAC-based activation (IP binding method)
      for (const mac of uniqueMacs) {
        commands.push(
          `# Activate MAC ${mac}`,
          `/ip hotspot ip-binding remove [/ip/hotspot/ip-binding find where mac-address=${mac}]`,
          `/ip hotspot ip-binding add mac-address=${mac} type=bypassed comment="auto:${routerId}"`,
        );
      }

      if (commands.length === 0) {
        commands.push(`:log info "WiFi Billing: no pending activations"`);
      }

      // Return as plain text script
      return new Response(commands.join("\n"), {
        headers: { "Content-Type": "text/plain" },
      });
    }

    // JSON format (default)
    return NextResponse.json({
      ips: uniqueIps,
      macs: uniqueMacs,
      count: pendingActivations.length,
      timestamp: new Date().toISOString(),
      message: `Found ${pendingActivations.length} pending activations for router ${routerId}`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[Pending Activations] Error:`, msg);

    if (format === "commands") {
      return new Response(`:log error "WiFi Billing API error: ${msg}"`, {
        headers: { "Content-Type": "text/plain" },
        status: 500,
      });
    }

    return NextResponse.json(
      { error: "Failed to get pending activations", details: msg },
      { status: 500 },
    );
  }
}



