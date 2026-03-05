import crypto from "crypto";

export function nowIso(): string {
  return new Date().toISOString();
}

export function randomId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

export function sanitizePhone(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  return digits;
}

export function minutesFromNow(minutes: number): string {
  const date = new Date();
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

export function toDateParts(iso: string): { date: string; time: string } {
  const date = new Date(iso);
  const day = date.toISOString().slice(0, 10);
  const clock = date.toISOString().slice(11, 19);
  return { date: day, time: clock };
}

export function safeCompare(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}

export function normalizeMac(mac: string): string {
  return mac.trim().toUpperCase().replace(/-/g, ":");
}
