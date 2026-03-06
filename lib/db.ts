import fs from "fs/promises";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { Database } from "@/lib/types";
import { nowIso, randomId } from "@/lib/utils";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");

const SUPABASE_TABLE = process.env.SUPABASE_STATE_TABLE ?? "app_state";
const SUPABASE_ROW_ID = process.env.SUPABASE_STATE_ROW_ID ?? "singleton";

let cache: Database | null = null;
const IS_PROD = process.env.NODE_ENV === "production";
const ALLOW_LOCAL_FALLBACK = process.env.SUPABASE_ALLOW_LOCAL_FALLBACK === "true";

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

async function readFromSupabase(): Promise<Database> {
  const client = supabase();
  const { data, error } = await client
    .from(SUPABASE_TABLE)
    .select("payload")
    .eq("id", SUPABASE_ROW_ID)
    .maybeSingle();
  if (error) {
    throw new Error(`Supabase read failed: ${error.message}`);
  }

  if (data?.payload) {
    return data.payload as Database;
  }

  const seeded = seedDatabase();
  const { error: upsertError } = await client
    .from(SUPABASE_TABLE)
    .upsert(
      { id: SUPABASE_ROW_ID, payload: sanitizeForStorage(seeded), updated_at: nowIso() },
      { onConflict: "id" },
    );
  if (upsertError) {
    throw new Error(`Supabase seed write failed: ${upsertError.message}`);
  }
  return seeded;
}

async function writeToSupabase(next: Database): Promise<void> {
  const client = supabase();
  const clean = sanitizeForStorage(next);
  const { error } = await client
    .from(SUPABASE_TABLE)
    .upsert({ id: SUPABASE_ROW_ID, payload: clean, updated_at: nowIso() }, { onConflict: "id" });
  if (error) {
    throw new Error(`Supabase write failed: ${error.message}`);
  }
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
    return {
      ...u,
      createdBy: owner,
    };
  });

  db.sessions = db.sessions.map((s) => {
    const owner =
      (s as Database["sessions"][number] & { createdBy?: string }).createdBy ??
      routerOwnerById.get(s.routerId) ??
      userOwnerById.get(s.userId) ??
      defaultCreatedBy;
    return {
      ...s,
      createdBy: owner,
    };
  });

  db.payments = db.payments.map((p) => {
    const owner =
      (p as Database["payments"][number] & { createdBy?: string }).createdBy ??
      routerOwnerById.get(p.routerId) ??
      defaultCreatedBy;
    return {
      ...p,
      createdBy: owner,
    };
  });

  if (!("paymentIntents" in db) || !Array.isArray(db.paymentIntents)) {
    return { ...db, paymentIntents: [] };
  }

  db.paymentIntents = db.paymentIntents.map((i) => ({
    ...i,
    createdBy: (i as Database["paymentIntents"][number] & { createdBy?: string }).createdBy
      ?? routerOwnerById.get(i.routerId)
      ?? defaultCreatedBy,
  }));

  return db;
}

export async function readDb(): Promise<Database> {
  if (cache) return cache;
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
    } catch (error) {
      if (IS_PROD || !ALLOW_LOCAL_FALLBACK) {
        throw new Error(`Failed to write to Supabase: ${(error as Error).message}`);
      }
      cache = null;
    }
  } else if (IS_PROD) {
    throw new Error("Supabase is required in production. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  } else {
    cache = next;
  }
}

export async function mutateDb<T>(mutator: (current: Database) => T | Promise<T>): Promise<T> {
  const current = await readDb();
  const cloned = structuredClone(current);
  const result = await mutator(cloned);
  await writeDb(cloned);
  return result;
}
