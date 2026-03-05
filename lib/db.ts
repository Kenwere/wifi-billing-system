import fs from "fs/promises";
import path from "path";
import { Database } from "@/lib/types";
import { nowIso, randomId } from "@/lib/utils";

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");
const FIREBASE_COLLECTION = "app_state";
const FIREBASE_DOC_ID = "singleton";

let cache: Database | null = null;
const IS_PROD = process.env.NODE_ENV === "production";

function hasFirebaseConfig(): boolean {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY,
  );
}

type FirebaseAdminModules = {
  app: {
    cert: (input: { projectId?: string; clientEmail?: string; privateKey?: string }) => unknown;
    getApps: () => unknown[];
    initializeApp: (input: { credential: unknown }) => unknown;
  };
  firestore: {
    getFirestore: () => {
      collection: (name: string) => {
        doc: (id: string) => {
          get: () => Promise<{ exists: boolean; data: () => unknown }>;
          set: (data: unknown, options: { merge: boolean }) => Promise<void>;
        };
      };
    };
  };
};

function loadFirebaseAdmin(): FirebaseAdminModules | null {
  try {
    const req = eval("require") as (id: string) => unknown;
    const app = req("firebase-admin/app") as FirebaseAdminModules["app"];
    const firestore = req("firebase-admin/firestore") as FirebaseAdminModules["firestore"];
    return { app, firestore };
  } catch {
    return null;
  }
}

function firestore() {
  const modules = loadFirebaseAdmin();
  if (!modules) {
    throw new Error("firebase-admin is not installed. Run: npm install firebase-admin");
  }
  const { app, firestore: fsdb } = modules;
  if (!app.getApps().length) {
    app.initializeApp({
      credential: app.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
  return fsdb.getFirestore();
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
  await ref.set({ payload: next, updatedAt: nowIso() }, { merge: true });
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
  await fs.writeFile(DATA_FILE, JSON.stringify(next, null, 2), "utf8");
}

function normalizeLegacyShape(db: Database): Database {
  const defaultTrial = db.tenant.subscription.trialEndsAt || nowIso();
  db.adminUsers = db.adminUsers.map((user) => ({
    ...user,
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
      if (IS_PROD) {
        throw new Error(
          `Firebase read failed in production: ${(error as Error).message}`,
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
    } catch {
      if (IS_PROD) {
        throw new Error("Failed to write to Firebase in production.");
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
