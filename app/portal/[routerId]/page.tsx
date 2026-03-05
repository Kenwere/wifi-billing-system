"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";

type PackageItem = { id: string; name: string; priceKsh: number; durationMinutes: number };

async function jfetch(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed: ${res.status}`);
  return data;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  if (minutes < 60 * 24) {
    const hours = minutes / 60;
    return Number.isInteger(hours) ? `${hours} hours` : `${hours.toFixed(1)} hours`;
  }
  if (minutes < 60 * 24 * 7) {
    const days = minutes / (60 * 24);
    return Number.isInteger(days) ? `${days} days` : `${days.toFixed(1)} days`;
  }
  const weeks = minutes / (60 * 24 * 7);
  return Number.isInteger(weeks) ? `${weeks} weeks` : `${weeks.toFixed(1)} weeks`;
}

export default function PortalPage() {
  const params = useParams<{ routerId: string }>();
  const routerId = params?.routerId ?? "";
  const [businessName, setBusinessName] = useState("WiFi");
  const [businessLogoUrl, setBusinessLogoUrl] = useState("");
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [voucherCode, setVoucherCode] = useState("");
  const [locked, setLocked] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!routerId) return;
    (async () => {
      try {
        const data = await jfetch(`/api/portal/status?routerId=${routerId}`);
        setPackages((data.packages ?? []) as PackageItem[]);
        setBusinessName(data.tenant?.businessName ?? "WiFi");
        setBusinessLogoUrl(data.tenant?.businessLogoUrl ?? "");
        setLocked(Boolean(data.subscription?.locked));
      } catch (err) {
        setMessage((err as Error).message);
      }
    })();
  }, [routerId]);

  const grouped = useMemo(() => {
    const short = packages.filter((p) => p.durationMinutes <= 60);
    const hourly = packages.filter((p) => p.durationMinutes > 60 && p.durationMinutes < 60 * 24 * 7);
    const weekly = packages.filter((p) => p.durationMinutes >= 60 * 24 * 7);
    return [
      { title: "30 Minutes / Short", items: short },
      { title: "Hours", items: hourly },
      { title: "Weeks", items: weekly },
    ].filter((group) => group.items.length > 0);
  }, [packages]);

  return (
    <>
      <Navbar title={`${businessName} WiFi`} showLogo={false} links={[{ label: "Home", href: "/" }]} />
      <main className="shell" style={{ maxWidth: 820, paddingTop: 24 }}>
        <section className="panel" style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {businessLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={businessLogoUrl} alt="Business logo" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 8 }} />
            ) : (
              <div style={{ width: 44, height: 44, borderRadius: 8, background: "#eef2ff" }} />
            )}
            <div>
              <h1 style={{ fontSize: "1.5rem" }}>{businessName} Hotspot</h1>
              <p style={{ color: "var(--muted)", margin: 0 }}>Select a package to continue.</p>
            </div>
          </div>
        </section>

        {locked ? (
          <section className="panel" style={{ padding: 16, marginTop: 14 }}>
            <h3 style={{ color: "var(--danger)" }}>Service unavailable</h3>
            <p style={{ margin: 0 }}>Hotspot is temporarily unavailable.</p>
          </section>
        ) : (
          <section className="panel" style={{ padding: 16, marginTop: 14 }}>
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: "1rem", marginBottom: 6 }}>Voucher Redeem</h3>
              <div className="voucher-grid">
                <input
                  value={voucherCode}
                  onChange={(e) => setVoucherCode(e.target.value)}
                  placeholder="Enter voucher code"
                />
                <Link
                  href={`/portal/${encodeURIComponent(routerId)}/checkout?voucher=${encodeURIComponent(voucherCode)}`}
                  className="btn btn-secondary"
                  style={{ textAlign: "center", paddingTop: 10 }}
                >
                  Redeem
                </Link>
              </div>
            </div>

            {grouped.map((group) => (
              <div key={group.title} style={{ marginBottom: 14 }}>
                <h3 style={{ fontSize: "1rem", marginBottom: 6 }}>{group.title}</h3>
                <div className="grid" style={{ gap: 6 }}>
                  {group.items.map((pkg) => (
                    <Link
                      key={pkg.id}
                      href={`/portal/${encodeURIComponent(routerId)}/checkout?packageId=${encodeURIComponent(pkg.id)}`}
                      className="panel package-row"
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{pkg.name}</span>
                      <span style={{ color: "var(--muted)" }}>{formatDuration(pkg.durationMinutes)}</span>
                      <span>KSH {pkg.priceKsh}</span>
                      <span className="btn btn-primary" style={{ padding: "6px 10px" }}>
                        Select
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {message && (
          <section className="panel" style={{ padding: 14, marginTop: 14 }}>
            {message}
          </section>
        )}
      </main>
    </>
  );
}
