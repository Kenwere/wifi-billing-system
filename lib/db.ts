import fs from "fs/promises";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { Database } from "@/lib/types";
import { nowIso, randomId } from "@/lib/utils";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");

const LEGACY_STATE_TABLE = process.env.SUPABASE_STATE_TABLE ?? "app_state";
const LEGACY_STATE_ROW_ID = process.env.SUPABASE_STATE_ROW_ID ?? "singleton";

const TABLES = {
  tenant: process.env.SUPABASE_TENANT_TABLE ?? "tenant_profiles",
  adminUsers: process.env.SUPABASE_ADMIN_USERS_TABLE ?? "admin_users",
  routers: process.env.SUPABASE_ROUTERS_TABLE ?? "mikrotiks",
  packages: process.env.SUPABASE_PACKAGES_TABLE ?? "wifi_packages",
  hotspotUsers: process.env.SUPABASE_HOTSPOT_USERS_TABLE ?? "hotspot_users",
  sessions: process.env.SUPABASE_SESSIONS_TABLE ?? "sessions",
  payments: process.env.SUPABASE_PAYMENTS_TABLE ?? "payments",
  paymentIntents: process.env.SUPABASE_PAYMENT_INTENTS_TABLE ?? "payment_intents",
  vouchers: process.env.SUPABASE_VOUCHERS_TABLE ?? "vouchers",
} as const;

type JsonRow<T> = {
  id: string;
  created_by: string | null;
  payload: T;
};

let cache: Database | null = null;
let cacheAtMs = 0;
const IS_PROD = process.env.NODE_ENV === "production";
const ALLOW_LOCAL_FALLBACK = process.env.SUPABASE_ALLOW_LOCAL_FALLBACK === "true";
const CACHE_TTL_MS = IS_PROD ? 0 : 1000;

function hasSupabaseConfig(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function supabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function sanitizeForStorage<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForStorage(item)) as T;
  }
  if (value instanceof Date) {
    return value.toISOString() as T;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return null as T;
  }
  if (typeof value === "bigint" || typeof value === "function" || typeof value === "symbol") {
    return null as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = sanitizeForStorage(v);
    }
    return out as T;
  }
  return value;
}

function seedDatabase(): Database {
  const createdAt = nowIso();
  const trialEnds = new Date();
  trialEnds.setDate(trialEnds.getDate() + 14);
  return {
    tenant: {
      id: randomId("tenant"),
      businessName: "",
      businessLogoUrl: "",
      createdAt,
      subscription: { trialEndsAt: trialEnds.toISOString() },
    },
    adminUsers: [],
    routers: [],
    packages: [],
    hotspotUsers: [],
    sessions: [],
    payments: [],
    paymentIntents: [],
    vouchers: [],
  };
}

async function ensureDataFile() {
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(seedDatabase(), null, 2), "utf8");
  }
}

async function readFromFile(): Promise<Database> {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  return JSON.parse(raw) as Database;
}

async function writeToFile(next: Database): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(sanitizeForStorage(next), null, 2), "utf8");
}

async function readJsonTable<T>(table: string): Promise<JsonRow<T>[]> {
  const client = supabase();
  const { data, error } = await client.from(table).select("id,created_by,payload");
  if (error) throw new Error(`Supabase read failed (${table}): ${error.message}`);
  return (data ?? []) as JsonRow<T>[];
}

async function upsertJsonTable<T extends { id: string }>(
  table: string,
  items: T[],
  createdByOf: (item: T) => string | undefined,
): Promise<void> {
  const client = supabase();
  const { data: existing, error: existingError } = await client.from(table).select("id");
  if (existingError) throw new Error(`Supabase read failed (${table}): ${existingError.message}`);
  const existingIds = new Set((existing ?? []).map((r) => String((r as { id: string }).id)));
  const nextIds = new Set(items.map((i) => i.id));

  const removeIds = Array.from(existingIds).filter((id) => !nextIds.has(id));
  if (removeIds.length > 0) {
    const { error: deleteError } = await client.from(table).delete().in("id", removeIds);
    if (deleteError) throw new Error(`Supabase delete failed (${table}): ${deleteError.message}`);
  }

  if (items.length === 0) return;
  const rows = items.map((item) => ({
    id: item.id,
    created_by: createdByOf(item) ?? null,
    payload: sanitizeForStorage(item),
    updated_at: nowIso(),
  }));
  const { error: upsertError } = await client.from(table).upsert(rows, { onConflict: "id" });
  if (upsertError) throw new Error(`Supabase upsert failed (${table}): ${upsertError.message}`);
}

async function readLegacySingleton(): Promise<Database | null> {
  const client = supabase();
  const { data, error } = await client
    .from(LEGACY_STATE_TABLE)
    .select("payload")
    .eq("id", LEGACY_STATE_ROW_ID)
    .maybeSingle();
  if (error) return null;
  return (data?.payload as Database | undefined) ?? null;
}

async function writeToSupabase(next: Database): Promise<void> {
  await upsertJsonTable(TABLES.tenant, [next.tenant], () => undefined);
  await upsertJsonTable(TABLES.adminUsers, next.adminUsers, (item) => item.id);
  await upsertJsonTable(TABLES.routers, next.routers, (item) => item.createdBy);
  await upsertJsonTable(TABLES.packages, next.packages, (item) => item.createdBy);
  await upsertJsonTable(TABLES.hotspotUsers, next.hotspotUsers, (item) => item.createdBy);
  await upsertJsonTable(TABLES.sessions, next.sessions, (item) => item.createdBy);
  await upsertJsonTable(TABLES.payments, next.payments, (item) => item.createdBy);
  await upsertJsonTable(TABLES.paymentIntents, next.paymentIntents, (item) => item.createdBy);
  await upsertJsonTable(TABLES.vouchers, next.vouchers, (item) => item.createdBy);
}

async function readFromSupabase(): Promise<Database> {
  const [tenantRows, adminRows, routerRows, packageRows, userRows, sessionRows, paymentRows, intentRows, voucherRows] =
    await Promise.all([
      readJsonTable<Database["tenant"]>(TABLES.tenant),
      readJsonTable<Database["adminUsers"][number]>(TABLES.adminUsers),
      readJsonTable<Database["routers"][number]>(TABLES.routers),
      readJsonTable<Database["packages"][number]>(TABLES.packages),
      readJsonTable<Database["hotspotUsers"][number]>(TABLES.hotspotUsers),
      readJsonTable<Database["sessions"][number]>(TABLES.sessions),
      readJsonTable<Database["payments"][number]>(TABLES.payments),
      readJsonTable<Database["paymentIntents"][number]>(TABLES.paymentIntents),
      readJsonTable<Database["vouchers"][number]>(TABLES.vouchers),
    ]);

  const hasAnyRows =
    tenantRows.length +
      adminRows.length +
      routerRows.length +
      packageRows.length +
      userRows.length +
      sessionRows.length +
      paymentRows.length +
      intentRows.length +
      voucherRows.length >
    0;

  if (!hasAnyRows) {
    const legacy = await readLegacySingleton();
    if (legacy) {
      await writeToSupabase(legacy);
      return legacy;
    }
    const seeded = seedDatabase();
    await writeToSupabase(seeded);
    return seeded;
  }

  const tenant = tenantRows[0]?.payload ?? seedDatabase().tenant;
  return {
    tenant,
    adminUsers: adminRows.map((r) => r.payload),
    routers: routerRows.map((r) => r.payload),
    packages: packageRows.map((r) => r.payload),
    hotspotUsers: userRows.map((r) => r.payload),
    sessions: sessionRows.map((r) => r.payload),
    payments: paymentRows.map((r) => r.payload),
    paymentIntents: intentRows.map((r) => r.payload),
    vouchers: voucherRows.map((r) => r.payload),
  };
}

function normalizeLegacyShape(db: Database): Database {
  const defaultTrial = db.tenant.subscription.trialEndsAt || nowIso();
  db.adminUsers = db.adminUsers.map((user) => ({
    ...user,
    businessName: user.businessName ?? db.tenant.businessName ?? "",
    businessLogoUrl: user.businessLogoUrl ?? db.tenant.businessLogoUrl ?? "",
    emailVerified: user.emailVerified ?? true,
    emailVerificationCodeHash: user.emailVerificationCodeHash ?? undefined,
    emailVerificationExpiresAt: user.emailVerificationExpiresAt ?? undefined,
    paymentStatus: user.paymentStatus ?? "trial",
    paymentExpiresAt: user.paymentExpiresAt ?? defaultTrial,
    trialEndsAt: user.trialEndsAt ?? defaultTrial,
    billingAnchorDay: user.billingAnchorDay ?? undefined,
    pendingPaystackReference: user.pendingPaystackReference ?? undefined,
  }));

  const firstAdmin = db.adminUsers[0];
  const defaultCreatedBy = firstAdmin?.id ?? "system";

  db.routers = db.routers.map((r) => ({
    ...r,
    createdBy: r.createdBy ?? defaultCreatedBy,
  }));
  db.packages = db.packages.map((p) => ({
    ...p,
    createdBy: p.createdBy ?? defaultCreatedBy,
  }));
  db.vouchers = db.vouchers.map((v) => ({
    ...v,
    createdBy: v.createdBy ?? defaultCreatedBy,
  }));

  const routerOwnerById = new Map(db.routers.map((r) => [r.id, r.createdBy]));
  const userOwnerById = new Map<string, string>();

  db.hotspotUsers = db.hotspotUsers.map((u) => {
    const owner =
      (u as Database["hotspotUsers"][number] & { createdBy?: string }).createdBy ?? defaultCreatedBy;
    userOwnerById.set(u.id, owner);
    return { ...u, createdBy: owner };
  });

  db.sessions = db.sessions.map((s) => {
    const owner =
      (s as Database["sessions"][number] & { createdBy?: string }).createdBy ??
      routerOwnerById.get(s.routerId) ??
      userOwnerById.get(s.userId) ??
      defaultCreatedBy;
    return { ...s, createdBy: owner };
  });

  db.payments = db.payments.map((p) => {
    const owner =
      (p as Database["payments"][number] & { createdBy?: string }).createdBy ??
      routerOwnerById.get(p.routerId) ??
      defaultCreatedBy;
    return { ...p, createdBy: owner };
  });

  if (!("paymentIntents" in db) || !Array.isArray(db.paymentIntents)) {
    return { ...db, paymentIntents: [] };
  }
  db.paymentIntents = db.paymentIntents.map((i) => ({
    ...i,
    createdBy:
      (i as Database["paymentIntents"][number] & { createdBy?: string }).createdBy ??
      routerOwnerById.get(i.routerId) ??
      defaultCreatedBy,
  }));
  return db;
}

export async function readDb(): Promise<Database> {
  if (cache && Date.now() - cacheAtMs < CACHE_TTL_MS) return cache;
  let loaded: Database;

  if (hasSupabaseConfig()) {
    try {
      loaded = await readFromSupabase();
    } catch (error) {
      if (IS_PROD || !ALLOW_LOCAL_FALLBACK) {
        throw new Error(`Supabase read failed: ${(error as Error).message}`);
      }
      loaded = await readFromFile();
    }
  } else {
    if (IS_PROD) {
      throw new Error("Supabase is required in production. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    }
    loaded = await readFromFile();
  }

  cache = normalizeLegacyShape(loaded);
  cacheAtMs = Date.now();
  return cache;
}

export async function writeDb(next: Database): Promise<void> {
  if (!IS_PROD) {
    await writeToFile(next);
  }

  if (hasSupabaseConfig()) {
    try {
      await writeToSupabase(next);
      cache = next;
      cacheAtMs = Date.now();
    } catch (error) {
      if (IS_PROD || !ALLOW_LOCAL_FALLBACK) {
        throw new Error(`Failed to write to Supabase: ${(error as Error).message}`);
      }
      cache = null;
      cacheAtMs = 0;
    }
  } else if (IS_PROD) {
    throw new Error("Supabase is required in production. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  } else {
    cache = next;
    cacheAtMs = Date.now();
  }
}

export async function mutateDb<T>(mutator: (current: Database) => T | Promise<T>): Promise<T> {
  const current = await readDb();
  const cloned = structuredClone(current);
  const result = await mutator(cloned);
  await writeDb(cloned);
  return result;
}
