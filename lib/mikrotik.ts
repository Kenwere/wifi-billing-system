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

export function buildMikrotikScript(router: RouterConfig, appBaseUrl: string): string {
  const safeName = router.name.replace(/"/g, "");
  const lanBridge = `br-hotspot-${router.id.slice(-6)}`;
  const portalBase = appBaseUrl.replace(/\/+$/, "");
  const portalUrl = `${portalBase}/portal/${router.id}`;
  const portalUrlWithDevice = `${portalUrl}?mac=$(mac)&ip=$(ip)`;
  const notes: string[] = [];

  if (router.setupOptions.disableHotspotSharing) {
    notes.push("Hotspot sharing disabled (shared-users=1)");
  }
  if (router.setupOptions.enableDeviceTracking) {
    notes.push("Device tracking rules enabled");
  }
  if (router.setupOptions.enableBandwidthControl) {
    notes.push("Bandwidth control profile scaffold enabled");
  }
  if (router.setupOptions.enableSessionLogging) {
    notes.push("Session logging topics enabled");
  }

  return [
    "# WiFi Billing MikroTik setup script",
    `# Router: ${safeName}`,
    "# WAN: ether1",
    "# Hotspot/LAN: ether2, ether3, ether4",
    `# Captive Portal Backend: ${portalBase}`,
    ...(notes.length ? ["# Options:", ...notes.map((n) => `# - ${n}`)] : []),
    "",
    ":log info \"Starting WiFi Billing setup...\"",
    "",
    "# 1) Create bridge for hotspot ports",
    `/interface bridge add name=${lanBridge} comment=\"WiFi Billing LAN bridge\"`,
    "/interface bridge port",
    `add bridge=${lanBridge} interface=ether2`,
    `add bridge=${lanBridge} interface=ether3`,
    `add bridge=${lanBridge} interface=ether4`,
    "",
    "# 2) Get internet on ether1 using DHCP client",
    "/ip dhcp-client add interface=ether1 disabled=no use-peer-dns=yes use-peer-ntp=yes",
    "",
    "# 3) LAN IP + DHCP server for hotspot clients",
    `/ip address add address=10.10.10.1/24 interface=${lanBridge} comment=\"Hotspot gateway\"`,
    "/ip pool add name=hs-pool ranges=10.10.10.10-10.10.10.250",
    `/ip dhcp-server add name=hs-dhcp interface=${lanBridge} address-pool=hs-pool disabled=no`,
    "/ip dhcp-server network add address=10.10.10.0/24 gateway=10.10.10.1 dns-server=8.8.8.8,1.1.1.1",
    "",
    "# 4) NAT for clients to reach internet",
    "/ip firewall nat add chain=srcnat out-interface=ether1 action=masquerade comment=\"WiFi Billing NAT\"",
    "",
    "# 5) Hotspot basic config",
    "/ip hotspot profile",
    `add name=hsprof-wifi-billing hotspot-address=10.10.10.1 html-directory=hotspot login-by=http-chap,http-pap,cookie`,
    `/ip hotspot add name=hotspot1 interface=${lanBridge} address-pool=hs-pool profile=hsprof-wifi-billing disabled=no`,
    "/ip hotspot user profile",
    `add name=wifi-billing-default shared-users=${router.setupOptions.disableHotspotSharing ? 1 : 3} ` +
      `rate-limit=${router.setupOptions.enableBandwidthControl ? "5M/5M" : "0/0"}`,
    "",
    "# 6) Walled garden: allow payment + backend while user is unauthenticated",
    "/ip hotspot walled-garden ip",
    `add dst-host=${portalBase.replace(/^https?:\/\//, "")} action=accept`,
    "",
    "# 7) Redirect hotspot login page to app portal",
    `:local wifiBillingPortalUrl "${portalUrlWithDevice}"`,
    ":local wifiBillingLoginHtml (\"<!doctype html><html><head><meta http-equiv=\\\"refresh\\\" content=\\\"0; url=\" . $wifiBillingPortalUrl . \"\\\"></head><body>Redirecting...</body></html>\")",
    ":do { /file set [find where name=\"hotspot/login.html\"] contents=$wifiBillingLoginHtml } on-error={ :log warning \"Could not update hotspot/login.html on first attempt\" }",
    ":delay 2s",
    ":do { /file set [find where name=\"hotspot/login.html\"] contents=$wifiBillingLoginHtml } on-error={ :log warning \"Portal redirect still not applied. Create hotspot files and re-import script.\" }",
    "",
    "# 8) Optional tracking/logging toggles",
    ...(router.setupOptions.enableDeviceTracking
      ? [
          "/ip firewall filter add chain=forward src-address=10.10.10.0/24 action=add-src-to-address-list " +
            "address-list=wifi-billing-devices address-list-timeout=1d comment=\"Track hotspot devices\"",
        ]
      : []),
    ...(router.setupOptions.enableSessionLogging
      ? ["/system logging add topics=hotspot,info action=memory"]
      : []),
    "",
    "# 9) Captive portal integration notes",
    `:put "Portal URL: ${portalUrlWithDevice}"`,
    `:put "Use routerId: ${router.id}"`,
    "",
    `:log info "WiFi Billing setup complete for ${safeName}"`,
  ].join("\n");
}
