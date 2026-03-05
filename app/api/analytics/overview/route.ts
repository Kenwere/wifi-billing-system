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
  const now = new Date();
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const startWeek = new Date(startToday);
  startWeek.setDate(startWeek.getDate() - 7);
  const startMonth = new Date(startToday);
  startMonth.setMonth(startMonth.getMonth() - 1);
  const startYear = new Date(startToday);
  startYear.setFullYear(startYear.getFullYear() - 1);

  const payments = db.payments.filter((p) => p.status === "active");
  const sum = (start: Date) =>
    payments
      .filter((p) => inRange(new Date(`${p.date}T${p.time}Z`), start, now))
      .reduce((n, p) => n + p.amountKsh, 0);

  const sessionsToday = db.sessions.filter((s) => new Date(s.loginTime) >= startToday);
  const activeSessions = db.sessions.filter((s) => s.status === "active").length;
  const expiredSessions = db.sessions.filter((s) => s.status === "expired").length;
  const totalRevenue = payments.reduce((n, p) => n + p.amountKsh, 0);
  const rankedMap = [...db.sessions].reduce<
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
  const trialEnds = new Date(db.tenant.subscription.trialEndsAt);
  const trialDaysLeft = Math.max(
    0,
    Math.ceil((trialEnds.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
  );
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
      ...db.tenant.subscription,
      trialDaysLeft,
      state: subscriptionState(db),
      projectedMonthlyFee: computeMonthlyFee(monthlyRevenue),
    },
  });
}
