"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
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
  if (minutes < 60 * 24) return `${minutes / 60} hours`;
  if (minutes < 60 * 24 * 7) return `${minutes / (60 * 24)} days`;
  return `${minutes / (60 * 24 * 7)} weeks`;
}

export default function PortalCheckoutPage() {
  const params = useParams<{ routerId: string }>();
  const search = useSearchParams();
  const routerId = params?.routerId ?? "";
  const packageId = search.get("packageId") ?? "";
  const voucherFromQuery = search.get("voucher") ?? "";
  const statusFromQuery = search.get("status") ?? "";
  const statusMessageFromQuery = search.get("message") ?? "";
  const macFromQuery = search.get("mac") ?? "";
  const ipFromQuery = search.get("ip") ?? "";

  const [selectedPackage, setSelectedPackage] = useState<PackageItem | null>(null);
  const [phone, setPhone] = useState("");
  const [voucherCode, setVoucherCode] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (voucherFromQuery) setVoucherCode(voucherFromQuery);
  }, [voucherFromQuery]);

  useEffect(() => {
    if (!statusFromQuery || !statusMessageFromQuery) return;
    if (statusFromQuery === "ok") {
      setMessage(statusMessageFromQuery);
      return;
    }
    setMessage(statusMessageFromQuery);
  }, [statusFromQuery, statusMessageFromQuery]);

  useEffect(() => {
    if (!routerId || !packageId) return;
    (async () => {
      try {
        const data = await jfetch(`/api/portal/status?routerId=${routerId}`);
        const found = (data.packages as PackageItem[]).find((p) => p.id === packageId) ?? null;
        setSelectedPackage(found);
      } catch (err) {
        setMessage((err as Error).message);
      }
    })();
  }, [routerId, packageId]);

  async function sendPrompt(e: FormEvent) {
    e.preventDefault();
    if (!selectedPackage) return;
    setLoading(true);
    setMessage("");
    try {
      const res = await jfetch("/api/payments/checkout", {
        method: "POST",
        body: JSON.stringify({
          routerId,
          phone,
          macAddress: macFromQuery,
          ipAddress: ipFromQuery,
          packageId: selectedPackage.id,
        }),
      });
      if (res.authorizationUrl) {
        window.location.href = String(res.authorizationUrl);
        return;
      }
      if (res.status === "pending") {
        setMessage("Payment prompt sent to your phone. Enter your M-Pesa PIN to complete.");
      } else {
        setMessage(`Connected. Session expires at ${new Date(res.session.expiresAt).toLocaleString()}`);
      }
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function redeemVoucher(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const res = await jfetch("/api/vouchers/redeem", {
        method: "POST",
        body: JSON.stringify({
          code: voucherCode,
          phone,
          macAddress: macFromQuery,
          ipAddress: ipFromQuery,
          routerId,
        }),
      });
      setMessage(`Voucher redeemed. Session expires at ${new Date(res.session.expiresAt).toLocaleString()}`);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Navbar title="WiFi Checkout" showLogo={false} links={[{ label: "Back to Packages", href: `/portal/${routerId}` }]} />
      <main className="shell" style={{ maxWidth: 620, paddingTop: 24 }}>
        <section className="panel" style={{ padding: 16 }}>
          <h2>Enter Phone Number</h2>
          {selectedPackage ? (
            <p style={{ color: "var(--muted)" }}>
              Package: <b>{selectedPackage.name}</b> ({formatDuration(selectedPackage.durationMinutes)}) - KSH{" "}
              {selectedPackage.priceKsh}
            </p>
          ) : (
            <p style={{ color: "var(--danger)" }}>Package not found.</p>
          )}
          <form className="grid" onSubmit={sendPrompt}>
            <input
              placeholder="0712345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
            <button className="btn btn-primary" disabled={!selectedPackage || loading}>
              {loading ? "Sending..." : "Send M-Pesa Prompt"}
            </button>
          </form>
          <div style={{ marginTop: 10 }}>
            <Link href={`/portal/${routerId}`} style={{ color: "var(--primary)" }}>
              Choose another package
            </Link>
          </div>
        </section>

        <section className="panel" style={{ padding: 16, marginTop: 12 }}>
          <h3>Redeem Voucher</h3>
          <form className="grid checkout-voucher-grid" onSubmit={redeemVoucher}>
            <input value={voucherCode} onChange={(e) => setVoucherCode(e.target.value)} placeholder="Voucher code" />
            <button className="btn btn-secondary" disabled={loading || !phone}>
              Redeem
            </button>
          </form>
        </section>

        {message && (
          <section className="panel" style={{ padding: 14, marginTop: 12 }}>
            {message}
          </section>
        )}
      </main>
    </>
  );
}
