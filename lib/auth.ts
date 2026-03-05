import crypto from "crypto";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { readDb } from "@/lib/db";
import { Role } from "@/lib/types";
import { hashPassword, safeCompare } from "@/lib/utils";

type TokenPayload = {
  sub: string;
  email: string;
  role: Role;
  exp: number;
};

const AUTH_COOKIE = "wifi_admin_token";
const AUTH_HEADER = "authorization";
const TOKEN_TTL_SECONDS = 60 * 60 * 24;
const JWT_SECRET = process.env.JWT_SECRET ?? "dev_jwt_secret_change_me";

function b64(data: string): string {
  return Buffer.from(data).toString("base64url");
}

function sign(data: string): string {
  return crypto.createHmac("sha256", JWT_SECRET).update(data).digest("base64url");
}

export function createToken(payload: Omit<TokenPayload, "exp">): string {
  const header = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const bodyPayload: TokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };
  const body = b64(JSON.stringify(bodyPayload));
  const signature = sign(`${header}.${body}`);
  return `${header}.${body}.${signature}`;
}

export function verifyToken(token: string): TokenPayload | null {
  const [header, body, signature] = token.split(".");
  if (!header || !body || !signature) return null;
  const expected = sign(`${header}.${body}`);
  if (!safeCompare(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function loginAdmin(email: string, password: string) {
  const db = await readDb();
  const user = db.adminUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user || !user.isActive) return null;
  if (!safeCompare(user.passwordHash, hashPassword(password))) return null;
  const token = createToken({ sub: user.id, email: user.email, role: user.role });
  return { token, user };
}

export async function setAuthCookie(token: string) {
  const store = await cookies();
  const isProd = process.env.NODE_ENV === "production";
  store.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: TOKEN_TTL_SECONDS,
  });
}

export async function clearAuthCookie() {
  const store = await cookies();
  store.set(AUTH_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export async function getAuthFromRequest(request: NextRequest): Promise<TokenPayload | null> {
  const auth = request.headers.get(AUTH_HEADER);
  if (auth?.startsWith("Bearer ")) {
    return verifyToken(auth.slice(7));
  }
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export const roleWeight: Record<Role, number> = {
  super_admin: 4,
  admin: 3,
  operator: 2,
  support: 1,
};

export function hasRole(userRole: Role, required: Role): boolean {
  return roleWeight[userRole] >= roleWeight[required];
}
