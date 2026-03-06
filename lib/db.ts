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
    const data = snap.data() as { payload?: Database };
    if (data?.payload) return data.payload;
  }
  const seeded = seedDatabase();
  await ref.set({ payload: seeded, updatedAt: nowIso() }, { merge: true });
  return seeded;
}

async function writeToFirebase(next: Database): Promise<void> {
  const db = firestore();
  const ref = db.collection(FIREBASE_COLLECTION).doc(FIREBASE_DOC_ID);
  await ref.set({ payload: sanitizeForStorage(next), updatedAt: nowIso() }, { merge: true });
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
    emailVerified: user.emailVerified ?? true,
    emailVerificationCodeHash: user.emailVerificationCodeHash ?? undefined,
    emailVerificationExpiresAt: user.emailVerificationExpiresAt ?? undefined,
    paymentStatus: user.paymentStatus ?? "trial",
    paymentExpiresAt: user.paymentExpiresAt ?? defaultTrial,
    trialEndsAt: user.trialEndsAt ?? defaultTrial,
  }));
  if (!("paymentIntents" in db) || !Array.isArray(db.paymentIntents)) {
    return { ...db, paymentIntents: [] };
  }
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
  cache = next;
  // In local development, keep a durable fallback file.
  if (!IS_PROD) {
    await writeToFile(next);
  }
  if (hasFirebaseConfig()) {
    try {
      await writeToFirebase(next);
    } catch (error) {
      if (IS_PROD || !ALLOW_LOCAL_FALLBACK) {
        throw new Error(`Failed to write to Firebase: ${(error as Error).message}`);
      }
      // Local write above already preserved state for retry on next cycle.
    }
  } else if (IS_PROD) {
    throw new Error("Firebase is required in production. Set FIREBASE_* environment variables.");
  }
}

export async function mutateDb<T>(mutator: (current: Database) => T | Promise<T>): Promise<T> {
  const current = await readDb();
  const cloned = structuredClone(current);
  const result = await mutator(cloned);
  await writeDb(cloned);
  return result;
}
