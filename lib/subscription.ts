import { Database } from "@/lib/types";

const BASE_FEE = 500;
const COMMISSION_THRESHOLD = 10000;
const COMMISSION_RATE = 0.03;

export function getPeriodRevenue(db: Database, startIso: string, endIso: string): number {
  return db.payments
    .filter((p) => p.status === "active" && p.date >= startIso && p.date <= endIso)
    .reduce((sum, p) => sum + p.amountKsh, 0);
}

export function computeMonthlyFee(revenueKsh: number): number {
  if (revenueKsh <= COMMISSION_THRESHOLD) return BASE_FEE;
  return BASE_FEE + revenueKsh * COMMISSION_RATE;
}

export function subscriptionState(db: Database) {
  const now = new Date();
  const trialEnds = new Date(db.tenant.subscription.trialEndsAt);
  const paidUntil = db.tenant.subscription.paidUntil
    ? new Date(db.tenant.subscription.paidUntil)
    : null;

  if (paidUntil && paidUntil >= now) {
    return { locked: false, reason: null as string | null };
  }
  if (trialEnds >= now) {
    return { locked: false, reason: null as string | null };
  }
  return {
    locked: true,
    reason: db.tenant.subscription.lockReason ?? "Subscription payment overdue",
  };
}

export function getTrialDaysRemaining(db: Database): number {
  const now = new Date();
  const trialEnds = new Date(db.tenant.subscription.trialEndsAt);
  const daysRemaining = Math.ceil((trialEnds.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, daysRemaining);
}
