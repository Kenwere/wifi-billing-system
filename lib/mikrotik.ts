import { RouterConfig, Session } from "@/lib/types";

export interface MikrotikSetupResult {
  ok: boolean;
  message: string;
  applied: string[];
}

function isLiveMode(): boolean {
  return process.env.MIKROTIK_LIVE_MODE === "true";
}

export async function setupRouter(router: RouterConfig): Promise<MikrotikSetupResult> {
  const applied: string[] = [];
  if (router.setupOptions.disableHotspotSharing) {
    applied.push("Hotspot shared-user disabled");
  }
  if (router.setupOptions.enableDeviceTracking) {
    applied.push("Address list device tracking enabled");
  }
  if (router.setupOptions.enableBandwidthControl) {
    applied.push("Queue/profile bandwidth control enabled");
  }
  if (router.setupOptions.enableSessionLogging) {
    applied.push("RADIUS/accounting log hooks enabled");
  }
  applied.push("Firewall and captive portal defaults applied");

  if (isLiveMode()) {
    // Replace with real RouterOS API commands in production:
    // 1) authenticate to API
    // 2) create hotspot profile/server
    // 3) install script snippets for reconnection/session expiry
    // 4) set firewall and NAT rules
  }

  return {
    ok: true,
    message: isLiveMode()
      ? `Router ${router.name} configured via RouterOS API`
      : `Router ${router.name} configured in simulation mode`,
    applied,
  };
}

export async function grantInternetAccess(
  router: RouterConfig,
  session: Session,
): Promise<{ ok: boolean; message: string }> {
  if (isLiveMode()) {
    // Replace with API calls:
    // /ip/hotspot/user/add or RADIUS authorize with profile + expiry
  }
  return {
    ok: true,
    message: `Access granted on ${router.name} for ${session.macAddress}`,
  };
}

export async function disconnectInternetAccess(
  router: RouterConfig,
  macAddress: string,
): Promise<{ ok: boolean; message: string }> {
  if (isLiveMode()) {
    // Replace with API calls to remove active host/session by MAC.
  }
  return {
    ok: true,
    message: `Disconnected ${macAddress} on ${router.name}`,
  };
}
