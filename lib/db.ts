import fs from "fs/promises";
import path from "path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { Database } from "@/lib/types";
import { nowIso, randomId } from "@/lib/utils";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");
const FIREBASE_COLLECTION = "app_state";
const FIREBASE_DOC_ID = "singleton";
const FIREBASE_COL = {
  tenant: "tenant",
  adminUsers: "admin_users",
  routers: "routers",
  packages: "packages",
  hotspotUsers: "hotspot_users",
  sessions: "sessions",
  payments: "payments",
  paymentIntents: "payment_intents",
  vouchers: "vouchers",
} as const;

let cache: Database | null = null;
const IS_PROD = process.env.NODE_ENV === "production";
const ALLOW_LOCAL_FALLBACK = process.env.FIREBASE_ALLOW_LOCAL_FALLBACK === "true";

function hasFirebaseConfig(): boolean {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY,
  );
}

function firestore() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
  return getFirestore();
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

async function readFromFirebase(): Promise<Database> {
  const db = firestore();
  const ref = db.collection(FIREBASE_COLLECTION).doc(FIREBASE_DOC_ID);
  const snap = await ref.get();
  if (snap.exists) {
    const data = snap.data() as { payload?: Database; tenant?: Database["tenant"] };
    if (data?.payload) return data.payload;
    if (data?.tenant) {
      return {
        tenant: data.tenant,
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
  }
  const seeded = seedDatabase();
  await ref.set({ payload: seeded, tenant: seeded.tenant, updatedAt: nowIso() }, { merge: true });
  return seeded;
}

async function mirrorCollection(name: string, items: Array<Record<string, unknown>>): Promise<void> {
  const db = firestore();
  const col = db.collection(name);
  const current = await col.get();
  const incomingIds = new Set(items.map((i) => String(i.id)));

  const ops: Array<() => Promise<void>> = [];

  for (const doc of current.docs) {
    if (!incomingIds.has(doc.id)) {
      ops.push(async () => {
        await doc.ref.delete();
      });
    }
  }
  for (const item of items) {
    const id = String(item.id);
    ops.push(async () => {
      await col.doc(id).set(sanitizeForStorage(item), { merge: true });
    });
  }

  for (let i = 0; i < ops.length; i += 250) {
    const slice = ops.slice(i, i + 250);
    await Promise.all(slice.map((fn) => fn()));
  }
}

function toMirrorItems<T extends { id: string }>(items: T[]): Array<Record<string, unknown>> {
  return items as unknown as Array<Record<string, unknown>>;
}

async function writeToFirebase(next: Database): Promise<void> {
  const db = firestore();
  const ref = db.collection(FIREBASE_COLLECTION).doc(FIREBASE_DOC_ID);
  const clean = sanitizeForStorage(next);
  
  try {
    await ref.set({ payload: clean, tenant: clean.tenant, updatedAt: nowIso() }, { merge: true });
    console.log("[Firebase] Main payload written successfully");
  } catch (error) {
    console.error("[Firebase] Failed to write main payload:", (error as Error).message);
    throw error;
  }

  try {
    await Promise.all([
      db.collection(FIREBASE_COL.tenant).doc(clean.tenant.id).set(clean.tenant, { merge: true }),
      mirrorCollection(FIREBASE_COL.adminUsers, toMirrorItems(clean.adminUsers)),
      mirrorCollection(FIREBASE_COL.routers, toMirrorItems(clean.routers)),
      mirrorCollection(FIREBASE_COL.packages, toMirrorItems(clean.packages)),
      mirrorCollection(FIREBASE_COL.hotspotUsers, toMirrorItems(clean.hotspotUsers)),
      mirrorCollection(FIREBASE_COL.sessions, toMirrorItems(clean.sessions)),
      mirrorCollection(FIREBASE_COL.payments, toMirrorItems(clean.payments)),
      mirrorCollection(FIREBASE_COL.paymentIntents, toMirrorItems(clean.paymentIntents)),
      mirrorCollection(FIREBASE_COL.vouchers, toMirrorItems(clean.vouchers)),
    ]);
    console.log("[Firebase] All collections mirrored successfully");
  } catch (error) {
    console.error("[Firebase] Failed to mirror collections:", (error as Error).message);
    throw error;
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
  
  // Add createdBy to legacy items for data isolation
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
  if (hasFirebaseConfig()) {
    try {
      loaded = await readFromFirebase();
    } catch (error) {
      if (IS_PROD || !ALLOW_LOCAL_FALLBACK) {
        throw new Error(
          `Firebase read failed: ${(error as Error).message}`,
        );
      }
      // In local development, fallback keeps service running if Firebase is temporarily unavailable.
      loaded = await readFromFile();
    }
  } else {
    if (IS_PROD) {
      throw new Error("Firebase is required in production. Set FIREBASE_* environment variables.");
    }
    loaded = await readFromFile();
  }
  cache = normalizeLegacyShape(loaded);
  return cache;
}

export async function writeDb(next: Database): Promise<void> {
  // In local development, keep a durable fallback file.
  if (!IS_PROD) {
    await writeToFile(next);
  }
  if (hasFirebaseConfig()) {
    try {
      await writeToFirebase(next);
      // Only update cache after successful write
      cache = next;
    } catch (error) {
      console.error("Firebase write error:", (error as Error).message);
      if (IS_PROD || !ALLOW_LOCAL_FALLBACK) {
        throw new Error(`Failed to write to Firebase: ${(error as Error).message}`);
      }
      // Local write above already preserved state for retry on next cycle.
      // Clear cache to force fresh read on next request
      cache = null;
    }
  } else if (IS_PROD) {
    throw new Error("Firebase is required in production. Set FIREBASE_* environment variables.");
  } else {
    // Local development without Firebase
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
