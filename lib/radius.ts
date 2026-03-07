import dgram from "dgram";
import crypto from "crypto";
import { Session, RouterConfig } from "@/lib/types";

/**
 * RADIUS Server Implementation for WiFi Session Management
 * 
 * This module provides RADIUS authentication support for the WiFi billing system.
 * It allows MikroTik to authenticate users against your backend via RADIUS.
 * 
 * Benefits of RADIUS:
 * - Better session tracking and accounting
 * - Real-time user connection/disconnection
 * - Bandwidth and time limits enforcement
 * - Better separation of concerns (auth vs access control)
 * 
 * Note: This requires MikroTik hotspot profile to be configured with RADIUS:
 * /ip hotspot profile set [find name=hsprof-wifi-billing] use-radius=yes
 */

interface RadiusPacket {
  code: number;
  id: number;
  length: number;
  authenticator: Buffer;
  attributes: RadiusAttribute[];
}

interface RadiusAttribute {
  type: number;
  length: number;
  value: Buffer | string;
}

// RADIUS Packet Type Codes
const RADIUS_CODES = {
  ACCESS_REQUEST: 1,
  ACCESS_ACCEPT: 2,
  ACCESS_REJECT: 3,
  ACCOUNTING_REQUEST: 4,
  ACCOUNTING_RESPONSE: 5,
} as const;

// RADIUS Attribute Type Codes
const RADIUS_ATTRS = {
  USER_NAME: 1,
  USER_PASSWORD: 2,
  REPLY_MESSAGE: 18,
  STATE: 24,
  SESSION_TIMEOUT: 27,
  IDLE_TIMEOUT: 28,
  ACCT_SESSION_ID: 44,
  FRAMED_IP_ADDRESS: 8,
  ACCT_STATUS_TYPE: 40,
} as const;

export interface RadiusConfig {
  secret: string;
  port: number;
  host: string;
}

export class RadiusServer {
  private config: RadiusConfig;
  private server: dgram.Socket | null = null;
  private sessionCache: Map<string, Session> = new Map();

  constructor(config: RadiusConfig) {
    this.config = config;
  }

  /**
   * Start the RADIUS server
   */
  async start(): Promise<void> {
    if (!process.env.RADIUS_ENABLED || process.env.RADIUS_ENABLED !== "true") {
      console.log("[RADIUS] Server disabled (set RADIUS_ENABLED=true to enable)");
      return;
    }

    this.server = dgram.createSocket("udp4");

    this.server.on("message", (msg, rinfo) => {
      console.log(`[RADIUS] Received packet from ${rinfo.address}:${rinfo.port}`);
      this.handlePacket(msg, rinfo).catch((error) => {
        console.error("[RADIUS] Error handling packet:", error);
      });
    });

    this.server.on("error", (error) => {
      console.error("[RADIUS] Server error:", error);
    });

    return new Promise((resolve, reject) => {
      if (!this.server) return reject(new Error("Server not initialized"));
      this.server.bind(this.config.port, this.config.host, () => {
        console.log(`[RADIUS] Server listening on ${this.config.host}:${this.config.port}`);
        resolve();
      });
      this.server.on("error", reject);
    });
  }

  /**
   * Stop the RADIUS server
   */
  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  /**
   * Handle incoming RADIUS packet
   */
  private async handlePacket(buffer: Buffer, rinfo: dgram.RemoteInfo): Promise<void> {
    try {
      const packet = this.parsePacket(buffer);
      console.log(`[RADIUS] Parsed packet: code=${packet.code}, id=${packet.id}`);

      if (packet.code === RADIUS_CODES.ACCESS_REQUEST) {
        await this.handleAccessRequest(packet, rinfo);
      } else if (packet.code === RADIUS_CODES.ACCOUNTING_REQUEST) {
        await this.handleAccountingRequest(packet, rinfo);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[RADIUS] Failed to handle packet: ${errorMsg}`);
    }
  }

  /**
   * Handle ACCESS REQUEST (user login)
   */
  private async handleAccessRequest(packet: RadiusPacket, rinfo: dgram.RemoteInfo): Promise<void> {
    const username = this.getAttribute(packet, RADIUS_ATTRS.USER_NAME) as string | undefined;
    const userPassword = this.getAttribute(packet, RADIUS_ATTRS.USER_PASSWORD) as string | undefined;

    console.log(`[RADIUS] ACCESS REQUEST: username=${username}`);

    if (!username || !userPassword) {
      return this.sendAccessReject(packet, rinfo, "Missing username or password");
    }

    // TODO: Validate against your session database
    // This is where you'd check if the user has an active paid session
    // For now, we'll accept all requests
    const session = this.sessionCache.get(username);

    if (!session) {
      return this.sendAccessReject(packet, rinfo, "No active session found");
    }

    return this.sendAccessAccept(packet, rinfo, session);
  }

  /**
   * Handle ACCOUNTING REQUEST (session status updates)
   */
  private async handleAccountingRequest(packet: RadiusPacket, rinfo: dgram.RemoteInfo): Promise<void> {
    const sessionId = this.getAttribute(packet, RADIUS_ATTRS.ACCT_SESSION_ID) as string | undefined;
    const statusType = this.getAttribute(packet, RADIUS_ATTRS.ACCT_STATUS_TYPE) as number | undefined;

    console.log(`[RADIUS] ACCOUNTING REQUEST: sessionId=${sessionId}, statusType=${statusType}`);

    // 1 = Start, 2 = Stop, 3 = Interim-Update
    if (statusType === 1) {
      console.log("[RADIUS] Session start recorded");
    } else if (statusType === 2) {
      console.log("[RADIUS] Session stop recorded");
    } else if (statusType === 3) {
      console.log("[RADIUS] Session interim update recorded");
    }

    return this.sendAccountingResponse(packet, rinfo);
  }

  /**
   * Parse incoming RADIUS packet
   */
  private parsePacket(buffer: Buffer): RadiusPacket {
    if (buffer.length < 20) {
      throw new Error("Packet too short");
    }

    const code = buffer[0];
    const id = buffer[1];
    const length = buffer.readUInt16BE(2);
    const authenticator = buffer.subarray(4, 20);
    const attributes: RadiusAttribute[] = [];

    let offset = 20;
    while (offset < length) {
      const type = buffer[offset];
      const attrLength = buffer[offset + 1];
      if (attrLength < 2 || offset + attrLength > length) break;

      const value = buffer.subarray(offset + 2, offset + attrLength);
      attributes.push({ type, length: attrLength, value });
      offset += attrLength;
    }

    return { code, id, length, authenticator, attributes };
  }

  /**
   * Get attribute value from RADIUS packet
   */
  private getAttribute(
    packet: RadiusPacket,
    attrType: number,
  ): string | number | Buffer | undefined {
    const attr = packet.attributes.find((a) => a.type === attrType);
    if (!attr) return undefined;

    if (attrType === RADIUS_ATTRS.USER_NAME || attrType === RADIUS_ATTRS.REPLY_MESSAGE) {
      return attr.value.toString("utf8");
    } else if (
      attrType === RADIUS_ATTRS.SESSION_TIMEOUT ||
      attrType === RADIUS_ATTRS.IDLE_TIMEOUT ||
      attrType === RADIUS_ATTRS.ACCT_STATUS_TYPE
    ) {
      if (Buffer.isBuffer(attr.value)) {
        return attr.value.readUInt32BE(0);
      }
      return 0;
    }

    return attr.value;
  }

  /**
   * Send ACCESS ACCEPT response
   */
  private sendAccessAccept(packet: RadiusPacket, rinfo: dgram.RemoteInfo, session: Session): void {
    const attributes: RadiusAttribute[] = [];

    // Add Session Timeout attribute (in seconds)
    const sessionTimeout = Math.max(
      1,
      Math.floor(
        (new Date(session.expiresAt).getTime() - Date.now()) / 1000,
      ),
    );
    if (sessionTimeout > 0) {
      attributes.push(
        this.createAttribute(
          RADIUS_ATTRS.SESSION_TIMEOUT,
          Buffer.alloc(4),
        ),
      );
      attributes[0].value = Buffer.alloc(4);
      (attributes[0].value as Buffer).writeUInt32BE(sessionTimeout, 0);
    }

    // Add Idle Timeout (30 minutes)
    const idleAttr = this.createAttribute(RADIUS_ATTRS.IDLE_TIMEOUT, Buffer.alloc(4));
    (idleAttr.value as Buffer).writeUInt32BE(1800, 0);
    attributes.push(idleAttr);

    const response = this.buildPacket(RADIUS_CODES.ACCESS_ACCEPT, packet.id, attributes, packet.authenticator);
    this.sendPacket(response, rinfo);

    console.log(`[RADIUS] Sent ACCESS ACCEPT for session ${session.id}`);
  }

  /**
   * Send ACCESS REJECT response
   */
  private sendAccessReject(packet: RadiusPacket, rinfo: dgram.RemoteInfo, reason: string): void {
    const attributes = [
      this.createAttribute(RADIUS_ATTRS.REPLY_MESSAGE, Buffer.from(reason, "utf8")),
    ];

    const response = this.buildPacket(RADIUS_CODES.ACCESS_REJECT, packet.id, attributes, packet.authenticator);
    this.sendPacket(response, rinfo);

    console.log(`[RADIUS] Sent ACCESS REJECT: ${reason}`);
  }

  /**
   * Send ACCOUNTING RESPONSE
   */
  private sendAccountingResponse(packet: RadiusPacket, rinfo: dgram.RemoteInfo): void {
    const response = this.buildPacket(
      RADIUS_CODES.ACCOUNTING_RESPONSE,
      packet.id,
      [],
      packet.authenticator,
    );
    this.sendPacket(response, rinfo);

    console.log("[RADIUS] Sent ACCOUNTING RESPONSE");
  }

  /**
   * Create a RADIUS attribute
   */
  private createAttribute(type: number, value: Buffer | string): RadiusAttribute {
    const buffer = typeof value === "string" ? Buffer.from(value, "utf8") : value;
    return { type, length: buffer.length + 2, value: buffer };
  }

  /**
   * Build RADIUS response packet
   */
  private buildPacket(
    code: number,
    id: number,
    attributes: RadiusAttribute[],
    requestAuthenticator: Buffer,
  ): Buffer {
    let attrLength = 0;
    const attrBuffers: Buffer[] = [];

    for (const attr of attributes) {
      const buffer = Buffer.alloc(attr.length);
      buffer[0] = attr.type;
      buffer[1] = attr.length;

      const value = typeof attr.value === "string" ? Buffer.from(attr.value, "utf8") : attr.value;
      value.copy(buffer, 2);

      attrBuffers.push(buffer);
      attrLength += attr.length;
    }

    const length = 20 + attrLength;
    const packet = Buffer.alloc(length);
    packet[0] = code;
    packet[1] = id;
    packet.writeUInt16BE(length, 2);

    // Response authenticator = MD5(Code+ID+Length+RequestAuth+Attributes+Secret)
    const temp = Buffer.alloc(length);
    temp[0] = code;
    temp[1] = id;
    temp.writeUInt16BE(length, 2);
    requestAuthenticator.copy(temp, 4);

    let offset = 20;
    for (const buffer of attrBuffers) {
      buffer.copy(temp, offset);
      offset += buffer.length;
    }

    const secret = Buffer.from(this.config.secret, "utf8");
    const responseAuth = crypto
      .createHash("md5")
      .update(Buffer.concat([temp.subarray(0, 20), Buffer.concat(attrBuffers), secret]))
      .digest();

    responseAuth.copy(packet, 4);
    offset = 20;
    for (const buffer of attrBuffers) {
      buffer.copy(packet, offset);
      offset += buffer.length;
    }

    return packet;
  }

  /**
   * Send RADIUS packet via UDP
   */
  private sendPacket(packet: Buffer, rinfo: dgram.RemoteInfo): void {
    if (!this.server) return;

    this.server.send(packet, 0, packet.length, rinfo.port, rinfo.address, (err) => {
      if (err) {
        console.error("[RADIUS] Failed to send packet:", err);
      }
    });
  }

  /**
   * Cache a session for RADIUS lookups
   */
  cacheSession(username: string, session: Session): void {
    this.sessionCache.set(username, session);
    // Auto-expire from cache when session expires
    const timeoutMs = Math.max(0, new Date(session.expiresAt).getTime() - Date.now());
    setTimeout(() => {
      this.sessionCache.delete(username);
    }, timeoutMs + 1000);
  }

  /**
   * Remove session from cache
   */
  uncacheSession(username: string): void {
    this.sessionCache.delete(username);
  }
}

// Singleton instance
let radiusServer: RadiusServer | null = null;

export function getRadiusServer(): RadiusServer {
  if (!radiusServer) {
    radiusServer = new RadiusServer({
      secret: process.env.RADIUS_SECRET || "moonconnect123",
      port: Number(process.env.RADIUS_PORT || 1812),
      host: process.env.RADIUS_HOST || "0.0.0.0",
    });
  }
  return radiusServer;
}

export async function initRadiusServer(): Promise<void> {
  const server = getRadiusServer();
  await server.start();
}
