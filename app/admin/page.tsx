"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart } from "@/components/BarChart";
import { Navbar } from "@/components/Navbar";

type AuthUser = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  isActive?: boolean;
  emailVerified?: boolean;
  paymentStatus?: string;
  paymentExpiresAt?: string;
};
type Overview = {
  earnings?: { daily?: number; weekly?: number; monthly?: number; yearly?: number };
  stats?: { usersToday?: number; activeSessions?: number; expiredSessions?: number; totalRevenue?: number };
  ranking?: RankingItem[];
  subscription?: {
    trialEndsAt?: string;
    trialDaysLeft?: number;
    paidUntil?: string;
    billingAnchorDay?: number;
    projectedMonthlyFee?: number;
    state?: { locked: boolean; reason?: string | null };
  };
};
type RouterItem = {
  id: string;
  name: string;
  location: string;
  host: string;
  paymentDestination?: {
    enabledMethods?: string[];
    mpesaTill?: string;
    mpesaPaybill?: string;
    mpesaPhone?: string;
    paystackPublicKey?: string;
    paystackSecretKey?: string;
  };
};
type PackageItem = {
  id: string;
  name: string;
  priceKsh: number;
  durationMinutes: number;
  speedLimitKbps?: number;
  dataLimitMb?: number;
  active: boolean;
};
type SessionItem = { id: string; phone: string; macAddress: string; routerId: string; status: string; expiresAt: string };
type PaymentItem = { id: string; userPhone: string; packageName: string; amountKsh: number; date: string; time: string; status: string };
type RankingItem = { phone: string; duration: number; connections: number };
type Tenant = { businessName: string; businessLogoUrl?: string };
type HotspotUserItem = { id: string; phone: string; macAddress: string; lastIp: string; updatedAt: string };

type SectionKey =
  | "overview"
  | "business"
  | "routers"
  | "packages"
  | "users"
  | "sessions"
  | "payments"
  | "ranking"
  | "subscription";

async function jfetch(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed: ${res.status}`);
  return data;
}

function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 60 * 24) return `${minutes / 60} hrs`;
  if (minutes < 60 * 24 * 7) return `${minutes / (60 * 24)} days`;
  return `${minutes / (60 * 24 * 7)} wks`;
}

function fmtDate(iso?: string): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString();
}

function fmtSpeed(kbps?: number): string {
  if (!kbps) return "Not set";
  return `${(kbps / 1000).toFixed(1)} Mbps`;
}

export default function AdminPage() {
  const [me, setMe] = useState<AuthUser | null>(null);
  const [section, setSection] = useState<SectionKey>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [overview, setOverview] = useState<Overview>({});
  const [tenant, setTenant] = useState<Tenant>({ businessName: "", businessLogoUrl: "" });
  const [routers, setRouters] = useState<RouterItem[]>([]);
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [hotspotUsers, setHotspotUsers] = useState<HotspotUserItem[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [payments, setPayments] = useState<PaymentItem[]>([]);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [authStage, setAuthStage] = useState<"credentials" | "verify">("credentials");
  const [registerName, setRegisterName] = useState("");
  const [registerBusiness, setRegisterBusiness] = useState("");
  const [verificationEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [routerForm, setRouterForm] = useState({
    name: "",
    location: "",
    disableHotspotSharing: true,
    enableDeviceTracking: true,
    enableBandwidthControl: true,
    enableSessionLogging: true,
  });
  const [packageForm, setPackageForm] = useState({
    name: "",
    priceKsh: 10,
    durationMinutes: 120,
    speedMbps: 5,
    unlimitedData: true,
    dataLimitMb: "",
    routerId: "",
  });
  const [paymentConfig, setPaymentConfig] = useState<{
    routerId: string;
    enabledMethods: string[];
    mpesaTill: string;
    mpesaPaybill: string;
    mpesaPhone: string;
    paystackPublicKey: string;
    paystackSecretKey: string;
  } | null>(null);
  const [usersImportMode, setUsersImportMode] = useState<"merge" | "replace">("merge");
  const [usersImportPayload, setUsersImportPayload] = useState("");
  const [usersImportResult, setUsersImportResult] = useState("");

  async function loadAll() {
    const [ov, rt, pk, us, ss, pl, tn] = await Promise.all([
      jfetch("/api/analytics/overview"),
      jfetch("/api/routers"),
      jfetch("/api/packages"),
      jfetch("/api/users"),
      jfetch("/api/sessions"),
      jfetch("/api/payments/logs"),
      jfetch("/api/tenant"),
    ]);
    setOverview(ov as Overview);
    setRouters((rt as { routers: RouterItem[] }).routers ?? []);
    setPackages((pk as { packages: PackageItem[] }).packages ?? []);
    setHotspotUsers((us as { users: HotspotUserItem[] }).users ?? []);
    setSessions((ss as { sessions: SessionItem[] }).sessions ?? []);
    setPayments((pl as { payments: PaymentItem[] }).payments ?? []);
    const currentTenant = (tn as { tenant: Tenant }).tenant;
    setTenant(currentTenant);
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("mode") === "register") {
        setIsRegisterMode(true);
      }
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const auth = await jfetch("/api/auth/me");
        setMe(auth.user as AuthUser);
        await loadAll();
      } catch {
        setMe(null);
      }
    })();
  }, []);

  async function run(action: () => Promise<void>, options?: { reload?: boolean }) {
    setBusy(true);
    setError("");
    try {
      await action();
      if (options?.reload !== false) {
        await loadAll();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const trialDaysLeft = overview.subscription?.trialDaysLeft ?? 0;
  const projectedFee = overview.subscription?.projectedMonthlyFee ?? 0;
  const ranking = overview.ranking ?? [];
  const earnings = overview.earnings ?? {};
  const stats = overview.stats ?? {};

  const revenueChart = useMemo(
    () => [
      { label: "Daily", value: Number(earnings.daily ?? 0) },
      { label: "Weekly", value: Number(earnings.weekly ?? 0) },
      { label: "Monthly", value: Number(earnings.monthly ?? 0) },
      { label: "Yearly", value: Number(earnings.yearly ?? 0) },
    ],
    [earnings.daily, earnings.weekly, earnings.monthly, earnings.yearly],
  );

  if (!me) {
    return (
      <>
        <Navbar />
        <main className="shell" style={{ paddingTop: 40 }}>
          <section className="panel" style={{ maxWidth: 420, margin: "8vh auto", padding: 20 }}>
            <h2>{authStage === "verify" ? "Verify OTP" : isRegisterMode ? "Register Admin" : "Admin Login"}</h2>
            {authStage === "verify" ? (
              <form
                className="grid"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    async () => {
                      const auth = await jfetch("/api/auth/verify", {
                        method: "POST",
                        body: JSON.stringify({ email: verificationEmail, code: verificationCode }),
                      });
                      setMe(auth.user as AuthUser);
                    },
                    { reload: false },
                  );
                }}
              >
                <p style={{ color: "var(--muted)", margin: 0 }}>
                  Enter the 6-digit OTP sent to <b>{verificationEmail}</b>.
                </p>
                <input
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  placeholder="Enter OTP"
                />
                <button className="btn btn-primary" disabled={busy}>
                  {busy ? "Please wait..." : "Verify and Continue"}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      async () => {
                        const res = await jfetch("/api/auth/resend-code", {
                          method: "POST",
                          body: JSON.stringify({ email: verificationEmail }),
                        });
                        setAuthNotice(String(res.message ?? "OTP sent."));
                      },
                      { reload: false },
                    )
                  }
                >
                  Resend OTP
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setAuthStage("credentials");
                    setVerificationCode("");
                    setAuthNotice("");
                  }}
                >
                  Back to Login
                </button>
              </form>
            ) : (
              <>
                <form
                  className="grid"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(
                      async () => {
                        const endpoint = isRegisterMode ? "/api/auth/register" : "/api/auth/login";
                        const payload = isRegisterMode
                          ? {
                              fullName: registerName,
                              businessName: registerBusiness,
                              email: loginEmail,
                              password: loginPassword,
                            }
                          : { email: loginEmail, password: loginPassword };
                        const auth = await jfetch(endpoint, {
                          method: "POST",
                          body: JSON.stringify(payload),
                        });
                        setMe(auth.user as AuthUser);
                      },
                      { reload: true },
                    );
                  }}
                >
                  {isRegisterMode && (
                    <>
                      <input
                        value={registerName}
                        onChange={(e) => setRegisterName(e.target.value)}
                        placeholder="Full name"
                      />
                      <input
                        value={registerBusiness}
                        onChange={(e) => setRegisterBusiness(e.target.value)}
                        placeholder="Business name"
                      />
                    </>
                  )}
                  <input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="Email" />
                  <input
                    value={loginPassword}
                    type="password"
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Password"
                  />
                  <button className="btn btn-primary" disabled={busy}>
                    {busy ? "Please wait..." : isRegisterMode ? "Create Admin Account" : "Sign In"}
                  </button>
                </form>
                <button
                  className="btn btn-secondary"
                  style={{ marginTop: 10 }}
                  onClick={() => setIsRegisterMode((prev) => !prev)}
                >
                  {isRegisterMode ? "Have an account? Login" : "New admin? Register"}
                </button>
              </>
            )}
            {authNotice && <p style={{ color: "var(--muted)" }}>{authNotice}</p>}
            {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar
        title="WiFi Admin"
        links={[
          { label: "Home", href: "/" },
          { label: "Documentation", href: "/docs" },
        ]}
        userMenu={{
          name: me.fullName,
          role: me.role,
          onLogout: () => {
            setMe(null);
            void jfetch("/api/auth/logout", { method: "POST" });
          },
        }}
      />
      <main className="shell" style={{ paddingTop: 18 }}>
        <div className="admin-mobile-actions">
          <button className="btn btn-secondary" onClick={() => setSidebarOpen(true)}>
            Menu
          </button>
        </div>
        {sidebarOpen && <div className="admin-backdrop" onClick={() => setSidebarOpen(false)} />}
        <div className="admin-layout">
          <aside className={`panel admin-sidebar ${sidebarOpen ? "open" : ""}`} style={{ padding: 12 }}>
            <div className="admin-mobile-actions" style={{ marginBottom: 8 }}>
              <button className="btn btn-secondary" onClick={() => setSidebarOpen(false)}>
                Close
              </button>
            </div>
            <h3>Admin</h3>
            <div className="panel" style={{ padding: 10, marginTop: 10, borderRadius: 8 }}>
              <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>Trial Days Left</div>
              <div style={{ fontSize: "1.25rem", fontWeight: 700, color: trialDaysLeft <= 3 ? "var(--danger)" : "var(--text)" }}>
                {trialDaysLeft}
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                Next monthly fee: KSH {Math.round(projectedFee)}
              </div>
            </div>
            <div className="grid" style={{ marginTop: 10 }}>
              {[
                ["overview", "Overview"],
                ["business", "Business"],
                ["routers", "MikroTik & Payments"],
                ["packages", "Packages"],
                ["users", "Users Import/Export"],
                ["sessions", "Sessions"],
                ["payments", "User Payments"],
                ["ranking", "User Ranking"],
                ["subscription", "Subscription"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={`btn ${section === key ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => {
                    setSection(key as SectionKey);
                    setSidebarOpen(false);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </aside>

          <section className="grid admin-content">
            {section === "overview" && (
              <>
                <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))" }}>
                  <div className="panel kpi">
                    <div className="label">Users Today</div>
                    <div className="value">{stats.usersToday ?? 0}</div>
                  </div>
                  <div className="panel kpi">
                    <div className="label">Active Sessions</div>
                    <div className="value">{stats.activeSessions ?? 0}</div>
                  </div>
                  <div className="panel kpi">
                    <div className="label">Expired Sessions</div>
                    <div className="value">{stats.expiredSessions ?? 0}</div>
                  </div>
                  <div className="panel kpi">
                    <div className="label">Total Revenue</div>
                    <div className="value">KSH {Number(stats.totalRevenue ?? 0).toLocaleString()}</div>
                  </div>
                </div>
                <BarChart title="Earnings" items={revenueChart} />
              </>
            )}

            {section === "business" && (
              <section className="panel" style={{ padding: 14 }}>
                <h3>Business Profile</h3>
                <p style={{ color: "var(--muted)", marginTop: 4 }}>
                  Set the business name and logo shown on the hotspot portal.
                </p>
                <form
                  className="grid"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      await jfetch("/api/tenant", {
                        method: "PATCH",
                        body: JSON.stringify(tenant),
                      });
                    });
                  }}
                >
                  <input
                    value={tenant.businessName}
                    onChange={(e) => setTenant({ ...tenant, businessName: e.target.value })}
                    placeholder="Business name"
                  />
                  <input
                    value={tenant.businessLogoUrl ?? ""}
                    onChange={(e) => setTenant({ ...tenant, businessLogoUrl: e.target.value })}
                    placeholder="Logo URL"
                  />
                  <button className="btn btn-primary" disabled={busy}>
                    Save Business Profile
                  </button>
                </form>
              </section>
            )}

            {section === "routers" && (
              <section className="panel" style={{ padding: 14 }}>
                <h3>MikroTik Setup and Payment Destination</h3>
                <p style={{ color: "var(--muted)", marginTop: 4 }}>
                  Script uses <b>ether1</b> as WAN and <b>ether2-ether4</b> as hotspot ports.
                </p>
                <form
                  className="responsive-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      await jfetch("/api/routers", {
                        method: "POST",
                        body: JSON.stringify({
                          name: routerForm.name,
                          location: routerForm.location,
                          setupOptions: {
                            disableHotspotSharing: routerForm.disableHotspotSharing,
                            enableDeviceTracking: routerForm.enableDeviceTracking,
                            enableBandwidthControl: routerForm.enableBandwidthControl,
                            enableSessionLogging: routerForm.enableSessionLogging,
                          },
                        }),
                      });
                    });
                  }}
                >
                  <input
                    value={routerForm.name}
                    onChange={(e) => setRouterForm({ ...routerForm, name: e.target.value })}
                    placeholder="Router name"
                  />
                  <input
                    value={routerForm.location}
                    onChange={(e) => setRouterForm({ ...routerForm, location: e.target.value })}
                    placeholder="Location"
                  />
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={routerForm.disableHotspotSharing}
                      onChange={(e) =>
                        setRouterForm({ ...routerForm, disableHotspotSharing: e.target.checked })
                      }
                    />
                    Disable hotspot sharing
                  </label>
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={routerForm.enableDeviceTracking}
                      onChange={(e) =>
                        setRouterForm({ ...routerForm, enableDeviceTracking: e.target.checked })
                      }
                    />
                    Enable device tracking
                  </label>
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={routerForm.enableBandwidthControl}
                      onChange={(e) =>
                        setRouterForm({ ...routerForm, enableBandwidthControl: e.target.checked })
                      }
                    />
                    Enable bandwidth control
                  </label>
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={routerForm.enableSessionLogging}
                      onChange={(e) =>
                        setRouterForm({ ...routerForm, enableSessionLogging: e.target.checked })
                      }
                    />
                    Enable session logging
                  </label>
                  <button className="btn btn-primary">Add MikroTik</button>
                </form>

                <div className="table-wrap"><table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Location</th>
                      <th>Host</th>
                      <th>Money Destination</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {routers.map((r) => (
                      <tr key={r.id}>
                        <td>{r.name}</td>
                        <td>{r.location}</td>
                        <td>{r.host}</td>
                        <td>{(r.paymentDestination?.enabledMethods ?? []).join(", ") || "Not configured"}</td>
                        <td style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            className="btn btn-secondary"
                            onClick={() => {
                              const pd = r.paymentDestination ?? {};
                              setPaymentConfig({
                                routerId: r.id,
                                enabledMethods: pd.enabledMethods ?? ["mpesa_till"],
                                mpesaTill: pd.mpesaTill ?? "",
                                mpesaPaybill: pd.mpesaPaybill ?? "",
                                mpesaPhone: pd.mpesaPhone ?? "",
                                paystackPublicKey: pd.paystackPublicKey ?? "",
                                paystackSecretKey: pd.paystackSecretKey ?? "",
                              });
                            }}
                          >
                            Configure Money Destination
                          </button>
                          <a className="btn btn-primary" href={`/api/routers/${r.id}/script`}>
                            Download Script
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>

                {paymentConfig && (
                  <div className="panel" style={{ padding: 12, marginTop: 12 }}>
                    <h4>Money Destination Settings</h4>
                    <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
                      <label><input type="checkbox" checked={paymentConfig.enabledMethods.includes("mpesa_till")} onChange={(e)=>setPaymentConfig({...paymentConfig, enabledMethods: e.target.checked ? [...paymentConfig.enabledMethods, "mpesa_till"] : paymentConfig.enabledMethods.filter((m)=>m!=="mpesa_till")})} /> M-Pesa Till</label>
                      <input placeholder="Till number" value={paymentConfig.mpesaTill} onChange={(e)=>setPaymentConfig({...paymentConfig, mpesaTill:e.target.value})}/>
                      <label><input type="checkbox" checked={paymentConfig.enabledMethods.includes("mpesa_paybill")} onChange={(e)=>setPaymentConfig({...paymentConfig, enabledMethods: e.target.checked ? [...paymentConfig.enabledMethods, "mpesa_paybill"] : paymentConfig.enabledMethods.filter((m)=>m!=="mpesa_paybill")})} /> M-Pesa Paybill</label>
                      <input placeholder="Paybill number" value={paymentConfig.mpesaPaybill} onChange={(e)=>setPaymentConfig({...paymentConfig, mpesaPaybill:e.target.value})}/>
                      <label><input type="checkbox" checked={paymentConfig.enabledMethods.includes("mpesa_phone")} onChange={(e)=>setPaymentConfig({...paymentConfig, enabledMethods: e.target.checked ? [...paymentConfig.enabledMethods, "mpesa_phone"] : paymentConfig.enabledMethods.filter((m)=>m!=="mpesa_phone")})} /> M-Pesa Phone</label>
                      <input placeholder="M-Pesa phone number" value={paymentConfig.mpesaPhone} onChange={(e)=>setPaymentConfig({...paymentConfig, mpesaPhone:e.target.value})}/>
                      <label><input type="checkbox" checked={paymentConfig.enabledMethods.includes("paystack")} onChange={(e)=>setPaymentConfig({...paymentConfig, enabledMethods: e.target.checked ? [...paymentConfig.enabledMethods, "paystack"] : paymentConfig.enabledMethods.filter((m)=>m!=="paystack")})} /> Paystack</label>
                      <input placeholder="Paystack public key" value={paymentConfig.paystackPublicKey} onChange={(e)=>setPaymentConfig({...paymentConfig, paystackPublicKey:e.target.value})}/>
                      <input placeholder="Paystack secret key" type="password" value={paymentConfig.paystackSecretKey} onChange={(e)=>setPaymentConfig({...paymentConfig, paystackSecretKey:e.target.value})}/>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      <button
                        className="btn btn-primary"
                        onClick={() =>
                          void run(async () => {
                            await jfetch("/api/routers", {
                              method: "PATCH",
                              body: JSON.stringify({
                                id: paymentConfig.routerId,
                                paymentDestination: {
                                  enabledMethods: Array.from(new Set(paymentConfig.enabledMethods)),
                                  mpesaTill: paymentConfig.mpesaTill,
                                  mpesaPaybill: paymentConfig.mpesaPaybill,
                                  mpesaPhone: paymentConfig.mpesaPhone,
                                  paystackPublicKey: paymentConfig.paystackPublicKey,
                                  paystackSecretKey: paymentConfig.paystackSecretKey,
                                },
                              }),
                            });
                            setPaymentConfig(null);
                          })
                        }
                      >
                        Save
                      </button>
                      <button className="btn btn-secondary" onClick={() => setPaymentConfig(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}

            {section === "packages" && (
              <section className="panel" style={{ padding: 14 }}>
                <h3>Packages</h3>
                <form
                  className="responsive-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      await jfetch("/api/packages", {
                        method: "POST",
                        body: JSON.stringify({
                          name: packageForm.name,
                          priceKsh: packageForm.priceKsh,
                          durationMinutes: packageForm.durationMinutes,
                          speedLimitKbps: Math.round(packageForm.speedMbps * 1000),
                          dataLimitMb: packageForm.unlimitedData
                            ? undefined
                            : Number(packageForm.dataLimitMb || 0),
                          routerId: packageForm.routerId,
                        }),
                      });
                    });
                  }}
                >
                  <input value={packageForm.name} onChange={(e) => setPackageForm({ ...packageForm, name: e.target.value })} placeholder="Package name" />
                  <input type="number" value={packageForm.priceKsh} onChange={(e) => setPackageForm({ ...packageForm, priceKsh: Number(e.target.value) })} placeholder="Price" />
                  <input type="number" value={packageForm.durationMinutes} onChange={(e) => setPackageForm({ ...packageForm, durationMinutes: Number(e.target.value) })} placeholder="Duration in minutes" />
                  <input
                    type="number"
                    value={packageForm.speedMbps}
                    onChange={(e) => setPackageForm({ ...packageForm, speedMbps: Number(e.target.value) })}
                    placeholder="Speed (Mbps)"
                  />
                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={packageForm.unlimitedData}
                      onChange={(e) => setPackageForm({ ...packageForm, unlimitedData: e.target.checked })}
                    />
                    Unlimited data
                  </label>
                  {!packageForm.unlimitedData && (
                    <input
                      type="number"
                      value={packageForm.dataLimitMb}
                      onChange={(e) => setPackageForm({ ...packageForm, dataLimitMb: e.target.value })}
                      placeholder="Data limit (MB)"
                    />
                  )}
                  <select value={packageForm.routerId} onChange={(e) => setPackageForm({ ...packageForm, routerId: e.target.value })}>
                    <option value="">Global/All Routers</option>
                    {routers.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <button className="btn btn-primary">Add</button>
                </form>
                <div className="table-wrap"><table>
                  <thead><tr><th>Name</th><th>Price</th><th>Time</th><th>Speed</th><th>Data</th><th>Actions</th></tr></thead>
                  <tbody>
                    {packages.map((p) => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td>KSH {p.priceKsh}</td>
                        <td>{fmtDuration(p.durationMinutes)}</td>
                        <td>{fmtSpeed(p.speedLimitKbps)}</td>
                        <td>{p.dataLimitMb ? `${p.dataLimitMb} MB` : "Unlimited"}</td>
                        <td style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            className={`btn ${p.active ? "btn-danger" : "btn-secondary"}`}
                            onClick={() =>
                              void run(async () => {
                                await jfetch("/api/packages", {
                                  method: "PATCH",
                                  body: JSON.stringify({ id: p.id, active: !p.active }),
                                });
                              })
                            }
                          >
                            {p.active ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            className="btn btn-danger"
                            onClick={() =>
                              void run(async () => {
                                await jfetch(`/api/packages?id=${encodeURIComponent(p.id)}`, {
                                  method: "DELETE",
                                });
                              })
                            }
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </section>
            )}

            {section === "users" && (
              <section className="panel" style={{ padding: 14 }}>
                <h3>Hotspot Users Import/Export</h3>
                <p style={{ color: "var(--muted)", marginTop: 4 }}>
                  Export all hotspot users, then import later using JSON payload.
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                  <a className="btn btn-primary" href="/api/users/export">
                    Export Users (JSON)
                  </a>
                  <span style={{ color: "var(--muted)", alignSelf: "center" }}>
                    Current users: {hotspotUsers.length}
                  </span>
                </div>
                <div className="grid" style={{ marginTop: 12 }}>
                  <select
                    value={usersImportMode}
                    onChange={(e) => setUsersImportMode(e.target.value as "merge" | "replace")}
                  >
                    <option value="merge">Merge with existing users</option>
                    <option value="replace">Replace all existing users</option>
                  </select>
                  <textarea
                    value={usersImportPayload}
                    onChange={(e) => setUsersImportPayload(e.target.value)}
                    placeholder='Paste exported JSON here (array or {"users":[...]})'
                    style={{
                      width: "100%",
                      minHeight: 180,
                      border: "1px solid var(--line)",
                      borderRadius: 10,
                      padding: 12,
                      fontFamily: "monospace",
                      fontSize: 12,
                    }}
                  />
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      const picker = document.createElement("input");
                      picker.type = "file";
                      picker.accept = "application/json,.json";
                      picker.onchange = async () => {
                        const file = picker.files?.[0];
                        if (!file) return;
                        const text = await file.text();
                        setUsersImportPayload(text);
                      };
                      picker.click();
                    }}
                  >
                    Load JSON File
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={busy || !usersImportPayload.trim()}
                    onClick={() =>
                      void run(async () => {
                        const parsed = JSON.parse(usersImportPayload);
                        const result = await jfetch("/api/users/import", {
                          method: "POST",
                          body: JSON.stringify({
                            mode: usersImportMode,
                            payload: parsed,
                          }),
                        });
                        setUsersImportResult(
                          `Imported ${result.imported}. Users before: ${result.before}, after: ${result.after}.`,
                        );
                      })
                    }
                  >
                    Import Users
                  </button>
                  {usersImportResult && <p style={{ color: "var(--muted)", margin: 0 }}>{usersImportResult}</p>}
                </div>
              </section>
            )}

            {section === "sessions" && (
              <section className="panel" style={{ padding: 14 }}>
                <h3>Sessions</h3>
                <div className="table-wrap"><table>
                  <thead><tr><th>Phone</th><th>MAC</th><th>Router</th><th>Status</th><th>Expires</th><th>Action</th></tr></thead>
                  <tbody>
                    {sessions.map((s) => (
                      <tr key={s.id}>
                        <td>{s.phone}</td>
                        <td>{s.macAddress}</td>
                        <td>{routers.find((r) => r.id === s.routerId)?.name ?? s.routerId}</td>
                        <td>{s.status}</td>
                        <td>{new Date(s.expiresAt).toLocaleString()}</td>
                        <td>
                          {s.status === "active" ? (
                            <button
                              className="btn btn-danger"
                              onClick={() =>
                                void run(async () => {
                                  await jfetch(`/api/sessions/${s.id}/disconnect`, { method: "POST" });
                                })
                              }
                            >
                              Disconnect
                            </button>
                          ) : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </section>
            )}

            {section === "payments" && (
              <section className="panel" style={{ padding: 14 }}>
                <h3>User Payment Logs</h3>
                <div className="table-wrap"><table>
                  <thead><tr><th>Phone</th><th>Package</th><th>Amount</th><th>Date</th><th>Time</th><th>Status</th></tr></thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td>{p.userPhone}</td>
                        <td>{p.packageName}</td>
                        <td>{p.amountKsh}</td>
                        <td>{p.date}</td>
                        <td>{p.time}</td>
                        <td>{p.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </section>
            )}

            {section === "ranking" && (
              <section className="panel" style={{ padding: 14 }}>
                <h3>Top Users</h3>
                <div className="table-wrap"><table>
                  <thead><tr><th>Rank</th><th>Phone</th><th>Hours Used</th><th>Connections</th></tr></thead>
                  <tbody>
                    {ranking.map((r, idx) => (
                      <tr key={r.phone}>
                        <td>{idx + 1}</td>
                        <td>{r.phone}</td>
                        <td>{(r.duration / 60).toFixed(1)}</td>
                        <td>{r.connections}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </section>
            )}

            {section === "subscription" && (
              <section className="panel" style={{ padding: 14 }}>
                <h3>Subscription Billing</h3>
                <p style={{ color: "var(--muted)" }}>
                  Trial days left: <b>{trialDaysLeft}</b>
                </p>
                <p style={{ color: "var(--muted)" }}>
                  Projected monthly fee: <b>KSH {Math.round(projectedFee)}</b>
                </p>
                <p style={{ color: "var(--muted)" }}>
                  Paid until: <b>{fmtDate(overview.subscription?.paidUntil)}</b>
                </p>
                <p style={{ color: "var(--muted)" }}>
                  Monthly billing day: <b>{overview.subscription?.billingAnchorDay ?? "Not set yet"}</b>
                </p>
                <p style={{ color: "var(--muted)" }}>
                  Account payment status: <b>{me.paymentStatus ?? "trial"}</b>
                </p>
                <p style={{ color: "var(--muted)" }}>
                  Account payment expiry: <b>{fmtDate(me.paymentExpiresAt)}</b>
                </p>
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const result = await jfetch("/api/subscription/pay", {
                        method: "POST",
                        body: JSON.stringify({ email: me.email }),
                      });
                      window.location.href = result.authorizationUrl as string;
                    })
                  }
                >
                  Pay Monthly Subscription (Paystack)
                </button>
                <p style={{ color: "var(--muted)", marginTop: 8 }}>
                  After successful payment, renewal is applied monthly on the same day.
                </p>
              </section>
            )}
            {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
          </section>
        </div>
      </main>
    </>
  );
}
