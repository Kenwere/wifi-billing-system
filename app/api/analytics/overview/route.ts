import { NextRequest, NextResponse } from "next/server";
import { readDb } from "@/lib/db";
import { requireRole } from "@/lib/guards";
import { computeMonthlyFee, subscriptionState } from "@/lib/subscription";

function inRange(date: Date, start: Date, end: Date): boolean {
  return date >= start && date <= end;
}

export async function GET(request: NextRequest) {
  const gate = await requireRole(request, "support");
  if (!gate.ok) return gate.response;
  const db = await readDb();
  const ownerId = gate.auth.sub;
  const scopedPayments =
    gate.auth.role === "super_admin"
      ? db.payments
      : db.payments.filter((p) => p.createdBy === ownerId);
  const scopedSessions =
    gate.auth.role === "super_admin"
      ? db.sessions
      : db.sessions.filter((s) => s.createdBy === ownerId);
  const ownerUser = db.adminUsers.find((u) => u.id === ownerId);
  const now = new Date();
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const startWeek = new Date(startToday);
  startWeek.setDate(startWeek.getDate() - 7);
  const startMonth = new Date(startToday);
  startMonth.setMonth(startMonth.getMonth() - 1);
  const startYear = new Date(startToday);
  startYear.setFullYear(startYear.getFullYear() - 1);

  const payments = scopedPayments.filter((p) => p.status === "active");
  const sum = (start: Date) =>
    payments
      .filter((p) => inRange(new Date(`${p.date}T${p.time}Z`), start, now))
      .reduce((n, p) => n + p.amountKsh, 0);

  const sessionsToday = scopedSessions.filter((s) => new Date(s.loginTime) >= startToday);
  const activeSessions = scopedSessions.filter((s) => s.status === "active").length;
  const expiredSessions = scopedSessions.filter((s) => s.status === "expired").length;
  const totalRevenue = payments.reduce((n, p) => n + p.amountKsh, 0);
  const rankedMap = [...scopedSessions].reduce<
    Record<string, { phone: string; duration: number; connections: number }>
  >((acc, s) => {
      if (!acc[s.phone]) acc[s.phone] = { phone: s.phone, duration: 0, connections: 0 };
      acc[s.phone].duration += s.durationUsedMinutes;
      acc[s.phone].connections += 1;
      return acc;
    }, {});
  const topUsers = Object.values(rankedMap)
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 10);

  const monthlyRevenue = sum(startMonth);
  const paymentExpiryIso =
    gate.auth.role === "super_admin"
      ? db.tenant.subscription.paidUntil ?? db.tenant.subscription.trialEndsAt
      : ownerUser?.paymentExpiresAt ?? now.toISOString();
  const paymentExpiresAt = new Date(paymentExpiryIso);
  const trialDaysLeft = Math.max(0, Math.ceil((paymentExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  return NextResponse.json({
    earnings: {
      daily: sum(startToday),
      weekly: sum(startWeek),
      monthly: monthlyRevenue,
      yearly: sum(startYear),
    },
    stats: {
      usersToday: new Set(sessionsToday.map((s) => s.phone)).size,
      activeSessions,
      expiredSessions,
      totalRevenue,
    },
    ranking: topUsers,
    subscription: {
      ...(gate.auth.role === "super_admin"
        ? db.tenant.subscription
        : {
            trialEndsAt: ownerUser?.trialEndsAt,
            paidUntil: ownerUser?.paymentExpiresAt,
            lockReason: ownerUser?.paymentStatus === "overdue" ? "Subscription payment overdue" : undefined,
          }),
      trialDaysLeft,
      state:
        gate.auth.role === "super_admin"
          ? subscriptionState(db)
          : {
              locked: ownerUser?.paymentStatus === "overdue",
              reason:
                ownerUser?.paymentStatus === "overdue"
                  ? "Subscription payment overdue"
                  : undefined,
            },
      projectedMonthlyFee: computeMonthlyFee(monthlyRevenue),
    },
  });
}
