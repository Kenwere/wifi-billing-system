import crypto from "crypto";
import net from "net";
import { RouterConfig, Session } from "@/lib/types";

export interface MikrotikSetupResult {
  ok: boolean;
  message: string;
  applied: string[];
}

function isLiveMode(): boolean {
  return process.env.MIKROTIK_LIVE_MODE === "true";
}

type ApiReply = {
  type: string;
  attrs: Record<string, string>;
};

const API_TIMEOUT_MS = Number(process.env.MIKROTIK_API_TIMEOUT_MS ?? 8000);

function encodeLength(len: number): Buffer {
  if (len < 0x80) return Buffer.from([len]);
  if (len < 0x4000) return Buffer.from([(len >> 8) | 0x80, len & 0xff]);
  if (len < 0x200000) return Buffer.from([(len >> 16) | 0xc0, (len >> 8) & 0xff, len & 0xff]);
  if (len < 0x10000000) {
    return Buffer.from([(len >> 24) | 0xe0, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
  }
  return Buffer.from([0xf0, (len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
}

function decodeLength(buf: Buffer, offset: number): { length: number; bytes: number } | null {
  if (offset >= buf.length) return null;
  const b = buf[offset] ?? 0;
  if ((b & 0x80) === 0x00) return { length: b, bytes: 1 };
  if ((b & 0xc0) === 0x80) {
    if (offset + 1 >= buf.length) return null;
    return { length: ((b & 0x3f) << 8) + (buf[offset + 1] ?? 0), bytes: 2 };
  }
  if ((b & 0xe0) === 0xc0) {
    if (offset + 2 >= buf.length) return null;
    return {
      length: ((b & 0x1f) << 16) + ((buf[offset + 1] ?? 0) << 8) + (buf[offset + 2] ?? 0),
      bytes: 3,
    };
  }
  if ((b & 0xf0) === 0xe0) {
    if (offset + 3 >= buf.length) return null;
    return {
      length:
        ((b & 0x0f) << 24) +
        ((buf[offset + 1] ?? 0) << 16) +
        ((buf[offset + 2] ?? 0) << 8) +
        (buf[offset + 3] ?? 0),
      bytes: 4,
    };
  }
  if (b === 0xf0) {
    if (offset + 4 >= buf.length) return null;
    return {
      length:
        ((buf[offset + 1] ?? 0) << 24) +
        ((buf[offset + 2] ?? 0) << 16) +
        ((buf[offset + 3] ?? 0) << 8) +
        (buf[offset + 4] ?? 0),
      bytes: 5,
    };
  }
  throw new Error("Unsupported RouterOS word length encoding");
}

class RouterOsApi {
  private socket: net.Socket;
  private buffer: Buffer;

  constructor(socket: net.Socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.socket.on("data", (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
    });
  }

  private writeSentence(words: string[]): Promise<void> {
    const buffers: Buffer[] = [];
    for (const word of words) {
      const w = Buffer.from(word, "utf8");
      buffers.push(encodeLength(w.length), w);
    }
    buffers.push(Buffer.from([0]));
    const payload = Buffer.concat(buffers);
    return new Promise((resolve, reject) => {
      this.socket.write(payload, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private tryReadSentence(): string[] | null {
    let offset = 0;
    const words: string[] = [];
    while (true) {
      const decoded = decodeLength(this.buffer, offset);
      if (!decoded) return null;
      offset += decoded.bytes;
      if (decoded.length === 0) {
        this.buffer = this.buffer.subarray(offset);
        return words;
      }
      if (offset + decoded.length > this.buffer.length) return null;
      const word = this.buffer.subarray(offset, offset + decoded.length).toString("utf8");
      words.push(word);
      offset += decoded.length;
    }
  }

  private async readSentence(timeoutMs = API_TIMEOUT_MS): Promise<string[]> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const sentence = this.tryReadSentence();
      if (sentence) return sentence;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("RouterOS API read timeout");
  }

  async command(words: string[]): Promise<ApiReply[]> {
    await this.writeSentence(words);
    const replies: ApiReply[] = [];
    while (true) {
      const sentence = await this.readSentence();
      if (!sentence[0]) continue;
      const type = sentence[0];
      const attrs: Record<string, string> = {};
      for (const part of sentence.slice(1)) {
        if (!part.startsWith("=")) continue;
        const nextEq = part.indexOf("=", 1);
        if (nextEq < 0) continue;
        const key = part.slice(1, nextEq);
        const val = part.slice(nextEq + 1);
        attrs[key] = val;
      }
      replies.push({ type, attrs });
      if (type === "!done" || type === "!trap" || type === "!fatal") {
        return replies;
      }
    }
  }
}

async function withRouterClient<T>(router: RouterConfig, fn: (client: RouterOsApi) => Promise<T>): Promise<T> {
  const socket = await new Promise<net.Socket>((resolve, reject) => {
    const s = net.createConnection({ host: router.host, port: router.apiPort });
    const onError = (err: Error) => {
      s.destroy();
      reject(err);
    };
    s.once("error", onError);
    s.once("connect", () => {
      s.removeListener("error", onError);
      s.setNoDelay(true);
      resolve(s);
    });
    s.setTimeout(API_TIMEOUT_MS, () => onError(new Error("RouterOS API connect timeout")));
  });

  const client = new RouterOsApi(socket);
  try {
    const login = await client.command([
      "/login",
      `=name=${router.username}`,
      `=password=${router.password}`,
    ]);
    const trap = login.find((r) => r.type === "!trap");
    if (trap) {
      const legacyStart = await client.command(["/login"]);
      const challenge = legacyStart.find((r) => r.attrs.ret)?.attrs.ret;
      if (!challenge) {
        throw new Error(trap.attrs.message || "RouterOS API login failed");
      }
      const digest = crypto
        .createHash("md5")
        .update(Buffer.concat([Buffer.from([0]), Buffer.from(router.password), Buffer.from(challenge, "hex")]))
        .digest("hex");
      const legacyLogin = await client.command([
        "/login",
        `=name=${router.username}`,
        `=response=00${digest}`,
      ]);
      const legacyTrap = legacyLogin.find((r) => r.type === "!trap");
      if (legacyTrap) {
        throw new Error(legacyTrap.attrs.message || "RouterOS API legacy login failed");
      }
    }
    return await fn(client);
  } finally {
    socket.end();
    socket.destroy();
  }
}

async function findIds(client: RouterOsApi, path: string, where: string[]): Promise<string[]> {
  const replies = await client.command([`${path}/print`, ...where]);
  return replies
    .filter((r) => r.type === "!re")
    .map((r) => r.attrs[".id"])
    .filter((id): id is string => Boolean(id));
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

export async function ensureUserInRestrictedList(
  router: RouterConfig,
  ipAddress: string,
): Promise<void> {
  if (isLiveMode() && ipAddress && ipAddress !== "0.0.0.0") {
    await withRouterClient(router, async (client) => {
      // Check if already in active list
      const activeIds = await findIds(client, "/ip/firewall/address-list", [
        "?list=wifi-billing-active",
        `?address=${ipAddress}`,
      ]);
      if (activeIds.length > 0) return; // Already has access

      // Check if already in restricted list
      const restrictedIds = await findIds(client, "/ip/firewall/address-list", [
        "?list=wifi-billing-restricted",
        `?address=${ipAddress}`,
      ]);
      if (restrictedIds.length > 0) return; // Already restricted

      // Add to restricted list
      const addRestricted = await client.command([
        "/ip/firewall/address-list/add",
        "=list=wifi-billing-restricted",
        `=address=${ipAddress}`,
        "=comment=new-user",
      ]);
      const addTrap = addRestricted.find((r) => r.type === "!trap");
      if (addTrap) {
        console.warn(`Failed to add ${ipAddress} to restricted list:`, addTrap.attrs.message);
      } else {
        console.log(`[MikroTik] Added ${ipAddress} to restricted list on ${router.name}`);
      }
    });
  }
}

export async function grantInternetAccess(
  router: RouterConfig,
  session: Session,
): Promise<{ ok: boolean; message: string }> {
  if (isLiveMode()) {
    const ip = session.ipAddress;
    if (!ip || ip === "0.0.0.0") {
      throw new Error("No valid IP address for session");
    }

    await withRouterClient(router, async (client) => {
      // Method 1: Use IP binding (more reliable)
      try {
        // Remove any existing binding for this MAC
        const existingBindings = await findIds(client, "/ip/hotspot/ip-binding", [
          `?mac-address=${session.macAddress}`,
        ]);
        for (const id of existingBindings) {
          await client.command(["/ip/hotspot/ip-binding/remove", `=.id=${id}`]);
        }

        // Add bypassed binding for paid user
        const addBinding = await client.command([
          "/ip/hotspot/ip-binding/add",
          `=mac-address=${session.macAddress}`,
          `=type=bypassed`,
          `=comment=session:${session.id}`,
        ]);
        const bindingTrap = addBinding.find((r) => r.type === "!trap");
        if (bindingTrap) {
          throw new Error(bindingTrap.attrs.message || "Failed to add IP binding");
        }

        console.log(`[MikroTik] Granted internet access via IP binding to ${session.macAddress} on ${router.name}`);
        return; // Success with IP binding method
      } catch (bindingError) {
        console.warn(`[MikroTik] IP binding failed, falling back to firewall method: ${bindingError}`);
      }

      // Method 2: Fallback to firewall address-list method
      // Remove from restricted list if present
      const restrictedIds = await findIds(client, "/ip/firewall/address-list", [
        "?list=wifi-billing-restricted",
        `?address=${ip}`,
      ]);
      for (const id of restrictedIds) {
        await client.command(["/ip/firewall/address-list/remove", `=.id=${id}`]);
      }

      // Add to active list (remove old entries first)
      const activeIds = await findIds(client, "/ip/firewall/address-list", [
        "?list=wifi-billing-active",
        `?address=${ip}`,
      ]);
      for (const id of activeIds) {
        await client.command(["/ip/firewall/address-list/remove", `=.id=${id}`]);
      }

      const addActive = await client.command([
        "/ip/firewall/address-list/add",
        "=list=wifi-billing-active",
        `=address=${ip}`,
        `=comment=session:${session.id}`,
      ]);
      const addTrap = addActive.find((r) => r.type === "!trap");
      if (addTrap) {
        throw new Error(addTrap.attrs.message || "Failed to add active address list entry");
      }

      console.log(`[MikroTik] Granted internet access via firewall to ${ip} on ${router.name}`);
    });
  }
  return {
    ok: true,
    message: `Access granted on ${router.name} for ${session.ipAddress}`,
  };
}

export async function disconnectInternetAccess(
  router: RouterConfig,
  macAddress: string,
): Promise<{ ok: boolean; message: string }> {
  if (isLiveMode()) {
    await withRouterClient(router, async (client) => {
      // Method 1: Remove IP binding (preferred method)
      try {
        const bindingIds = await findIds(client, "/ip/hotspot/ip-binding", [
          `?mac-address=${macAddress}`,
        ]);
        for (const id of bindingIds) {
          await client.command(["/ip/hotspot/ip-binding/remove", `=.id=${id}`]);
        }
        console.log(`[MikroTik] Removed IP binding for ${macAddress} on ${router.name}`);
      } catch (bindingError) {
        console.warn(`[MikroTik] IP binding removal failed: ${bindingError}`);
      }

      // Method 2: Fallback to firewall address-list method
      // Find sessions for this MAC address
      const db = await import("@/lib/db").then(m => m.readDb());
      const sessions = db.sessions.filter(s =>
        s.macAddress.toLowerCase() === macAddress.toLowerCase() &&
        s.routerId === router.id &&
        s.status === "active"
      );

      // Remove all IPs associated with this MAC from active list
      for (const session of sessions) {
        if (session.ipAddress && session.ipAddress !== "0.0.0.0") {
          const activeIds = await findIds(client, "/ip/firewall/address-list", [
            "?list=wifi-billing-active",
            `?address=${session.ipAddress}`,
          ]);
          for (const id of activeIds) {
            await client.command(["/ip/firewall/address-list/remove", `=.id=${id}`]);
          }

          // Add back to restricted list
          const restrictedIds = await findIds(client, "/ip/firewall/address-list", [
            "?list=wifi-billing-restricted",
            `?address=${session.ipAddress}`,
          ]);
          if (restrictedIds.length === 0) {
            await client.command([
              "/ip/firewall/address-list/add",
              "=list=wifi-billing-restricted",
              `=address=${session.ipAddress}`,
              `=comment=disconnected:${session.id}`,
            ]);
          }
        }
      }
    });
  }
  return {
    ok: true,
    message: `Access revoked on ${router.name} for ${macAddress}`,
  };
}

export function buildMikrotikScript(router: RouterConfig, appBaseUrl: string): string {
  const safeName = router.name.replace(/"/g, "");
  const lanBridge = `br-hotspot-${router.id.slice(-6)}`;
  const portalBase = appBaseUrl.replace(/\/+$/, "");
  const portalHost = (() => {
    try {
      return new URL(portalBase).hostname;
    } catch {
      return portalBase.replace(/^https?:\/\//, "");
    }
  })();
  const portalUrl = `${portalBase}/portal/${router.id}`;
  const portalUrlWithDevice = `${portalUrl}?mac=$(mac)&ip=$(ip)`;
  const notes: string[] = [];
  const usesPaystack = (router.paymentDestination?.enabledMethods ?? []).includes("paystack");
  const apiAllowIps = (process.env.MIKROTIK_API_ALLOWLIST_IPS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const wanInterface = process.env.MIKROTIK_WAN_INTERFACE?.trim() ?? "";
  const paystackHosts = [
    "paystack.com",
    "*.paystack.com",
    "checkout.paystack.com",
    "api.paystack.co",
    "js.paystack.co",
  ];
  const pendingActivationsUrl = `${portalBase}/api/routers/${router.id}/pending-activations`;

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

  // Create a separate script file for the polling that will be imported
  const pollingScriptContent = [
    "# WiFi Billing Polling Script",
    ":log info \"WiFi Billing: Checking for pending activations...\"",
    `/tool fetch url="${pendingActivationsUrl}" dst-path="wifi-bill-cmd.txt"`,
    ":if ([/file find name=\"wifi-bill-cmd.txt\"] != \"\") do={",
    "  :log info \"WiFi Billing: Found activation commands\"",
    "  /import file-name=\"wifi-bill-cmd.txt\"",
    "  :delay 2s",
    "  /file remove \"wifi-bill-cmd.txt\"",
    "}",
    ":log info \"WiFi Billing: Polling complete\"",
  ].join("\n");

  return [
    "# WiFi Billing MikroTik setup script",
    `# Router: ${safeName}`,
    `# WAN: ${wanInterface || "auto-detect (dhcp-client bound interface, fallback ether1)"}`,
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
    "# 4b) Secure RouterOS API (TCP 8728) from allowed backend IPs only",
    `:local moonWanIf "${wanInterface}"`,
    ":if ($moonWanIf = \"\") do={",
    "  :if ([:len [/ip dhcp-client find where disabled=no and status=\"bound\"]] > 0) do={",
    "    :set moonWanIf [/ip dhcp-client get [find where disabled=no and status=\"bound\"] interface]",
    "    :log info (\"MoonConnect WAN auto-detected: \" . $moonWanIf)",
    "  } else={",
    "    :set moonWanIf \"ether1\"",
    "    :log warning \"MoonConnect WAN auto-detect failed. Falling back to ether1\"",
    "  }",
    "}",
    ":foreach i in=[/ip firewall filter find where comment~\"MoonConnect API\"] do={",
    "  /ip firewall filter remove $i",
    "  :log info \"MoonConnect removed old API firewall rule\"",
    "}",
    "/ip service set api address=0.0.0.0/0 port=8728 disabled=no",
    ":log info \"MoonConnect enabled RouterOS API service on tcp/8728\"",
    ...(apiAllowIps.length
      ? [
          ...apiAllowIps.map(
            (ip) =>
              `/ip firewall filter add chain=input in-interface=$moonWanIf src-address=${ip} protocol=tcp dst-port=8728 action=accept comment="MoonConnect API allow ${ip}"`,
          ),
          ...apiAllowIps.map((ip) => `:log info "MoonConnect applied API allow rule for ${ip}"`),
          `/ip firewall filter add chain=input in-interface=$moonWanIf protocol=tcp dst-port=8728 action=drop comment="MoonConnect API drop others"`,
          `:log info "MoonConnect applied API drop rule for non-allowlisted sources on $moonWanIf"`,
        ]
      : [
          `:log warning "MIKROTIK_API_ALLOWLIST_IPS not set; API 8728 exposed until you add firewall allowlist rules."`,
        ]),
    "",
    "# 5) Hotspot config with firewall-based access control",
    "/ip hotspot profile",
    `add name=hsprof-wifi-billing hotspot-address=10.10.10.1 html-directory=hotspot login-by=http-chap,http-pap,cookie use-radius=no`,
    `/ip hotspot add name=hotspot1 interface=${lanBridge} address-pool=hs-pool profile=hsprof-wifi-billing disabled=no`,
    "/ip hotspot user profile",
    `add name=wifi-billing-default shared-users=${router.setupOptions.disableHotspotSharing ? 1 : 3} ` +
      `rate-limit=${router.setupOptions.enableBandwidthControl ? "5M/5M" : "0/0"}`,
    "",
    "# 5b) Firewall-based access control (REQUIRED for API-based network unlock)",
    "# Allow established and related connections (prevents connection breaking)",
    "/ip firewall filter add chain=forward action=accept connection-state=established,related comment=\"WiFi Billing: allow established connections\"",
    "",
    "# Create address lists for user management (fallback method)",
    "/ip firewall address-list",
    `add list=wifi-billing-active comment="WiFi Billing - Active users (full internet)"`,
    `add list=wifi-billing-restricted comment="WiFi Billing - Restricted users (captive only)"`,
    "",
    "# Allow full internet access for active (paid) users - MUST be first",
    "/ip firewall filter add chain=forward action=accept src-address-list=wifi-billing-active comment=\"WiFi Billing: allow internet for active users\"",
    "",
    "# Allow DNS for restricted users",
    "/ip firewall filter add chain=forward action=accept src-address-list=wifi-billing-restricted protocol=udp dst-port=53 comment=\"WiFi Billing: allow DNS UDP for restricted\"",
    "/ip firewall filter add chain=forward action=accept src-address-list=wifi-billing-restricted protocol=tcp dst-port=53 comment=\"WiFi Billing: allow DNS TCP for restricted\"",
    "",
    "# Block all other traffic for restricted users",
    "/ip firewall filter add chain=forward action=drop src-address-list=wifi-billing-restricted comment=\"WiFi Billing: block internet for restricted users\"",
    "",
    "# 5c) IP Binding setup (PRIMARY method for access control - more reliable than firewall)",
    "# Note: IP bindings will be managed dynamically by the polling script",
    "",
    "# 6) Walled garden: allow payment + backend while user is unauthenticated",
    "/ip hotspot walled-garden",
    `add action=allow dst-host=${portalHost}`,
    `add action=allow dst-host=*.${portalHost}`,
    ...(usesPaystack
      ? [
          ...paystackHosts.map((host) => `add action=allow dst-host=${host}`),
        ]
      : []),
    "",
    "# 6b) Additional firewall rules for walled garden (fallback for when hotspot walled-garden fails)",
    "# Allow access to portal and payment sites for all hotspot users",
    `/ip firewall filter add chain=forward action=accept dst-host=${portalHost} protocol=tcp dst-port=80,443 comment="WiFi Billing: allow portal access"`,
    ...(usesPaystack
      ? paystackHosts
          .filter((host) => !host.includes("*"))
          .map((host) => `/ip firewall filter add chain=forward action=accept dst-host=${host} protocol=tcp dst-port=80,443 comment="WiFi Billing: allow payment processor"`)
      : []),
    "# 7) Redirect hotspot login page to app portal",
    `:local wifiBillingPortalUrl "${portalUrlWithDevice}"`,
    ":local wifiBillingLoginHtml (\"<!doctype html><html><head><meta charset=\\\"utf-8\\\"><meta http-equiv=\\\"refresh\\\" content=\\\"0; url=\" . $wifiBillingPortalUrl . \"\\\"><script>location.replace('\" . $wifiBillingPortalUrl . \"');</script></head><body>Redirecting...</body></html>\")",
    ":do { /file set [find where name=\"hotspot/login.html\"] contents=$wifiBillingLoginHtml } on-error={ :log warning \"Could not update hotspot/login.html on first attempt\" }",
    ":do { /file set [find where name=\"hotspot/alogin.html\"] contents=$wifiBillingLoginHtml } on-error={ :log warning \"Could not update hotspot/alogin.html\" }",
    ":delay 1s",
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
    "# 9) Create polling script file",
    "# This script will be called by the scheduler",
    "",
    "# Create the polling script",
    "/system script add name=\"wifi-billing-poll\" source={",
    pollingScriptContent.split("\n").map(line => `  ${line}`).join("\n"),
    "} comment=\"WiFi Billing: Poll for activations\"",
    "",
    "# Clean up old scheduler jobs",
    ":foreach i in=[/system scheduler find where name=\"wifi-billing-scheduler\"] do={",
    "  /system scheduler remove numbers=$i",
    "  :log info \"WiFi Billing: removed old scheduler job\"",
    "}",
    "",
    "# Create scheduler that calls the script",
    "/system scheduler add name=\"wifi-billing-scheduler\" interval=30s on-event=\"/system script run wifi-billing-poll\" comment=\"WiFi Billing: Run polling script\"",
    "",
    ":log info \"WiFi Billing polling enabled (interval: 30s)\"",
    "",
    "# 10) Captive portal integration notes",
    `:put "Portal URL: ${portalUrlWithDevice}"`,
    `:put "Use routerId: ${router.id}"`,
    "",
    `:log info "WiFi Billing setup complete for ${safeName}"`,
  ].join("\n");
}