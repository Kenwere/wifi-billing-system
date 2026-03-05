"use client";

import Link from "next/link";
import { Navbar } from "@/components/Navbar";

const capabilities = [
  {
    title: "Hotspot Billing",
    desc: "Create package plans by minutes, hours, days, and weeks with automatic expiry and reconnection logic.",
  },
  {
    title: "MikroTik Control",
    desc: "Manage multiple MikroTik sites with per-device package, script, and payment destination settings.",
  },
  {
    title: "Payments and Vouchers",
    desc: "Support M-Pesa and Paystack, verify transactions, and redeem vouchers directly from the captive portal.",
  },
  {
    title: "Business Analytics",
    desc: "Track active sessions, payment logs, usage ranking, and earnings with clear operational reporting.",
  },
];

export default function Home() {
  return (
    <>
      <Navbar
        title="WiFi Billing"
        links={[{ label: "Documentation", href: "/docs" }]}
        authLinks={[
          { label: "Login", href: "/admin", variant: "secondary" },
          { label: "Register", href: "/admin?mode=register", variant: "primary" },
        ]}
      />

      <main className="shell" style={{ paddingTop: 24 }}>
        <section className="landing-hero">
          <div className="landing-hero-left">
            <p className="landing-kicker">WiFi Billing and Hotspot Management</p>
            <h1>Run a professional hotspot business from one dashboard</h1>
            <p className="landing-subtext">
              Configure MikroTik hotspots, publish packages, accept payments, and connect users instantly after
              successful verification. Designed for cafes, hostels, schools, and public access networks.
            </p>
            <div className="landing-cta-row">
              <Link href="/admin?mode=register" className="btn btn-primary">
                Create Admin Account
              </Link>
              <Link href="/admin" className="btn btn-secondary">
                Sign In
              </Link>
            </div>
          </div>
          <div className="landing-hero-right panel">
            <h3>Platform Highlights</h3>
            <div className="landing-highlight-list">
              <div>
                <b>Instant Access</b>
                <p>Users connect, pay, and get internet automatically without manual approval.</p>
              </div>
              <div>
                <b>Multi-Site Operations</b>
                <p>Manage multiple MikroTik locations and assign dedicated package and payment settings.</p>
              </div>
              <div>
                <b>Recurring SaaS Billing</b>
                <p>Track trial days, monthly subscription fees, and account status from the admin area.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-stats">
          <article className="panel">
            <h3>Package Plans</h3>
            <p>Minutes, hourly, daily, and weekly options with speed and data control.</p>
          </article>
          <article className="panel">
            <h3>Payment Gateways</h3>
            <p>M-Pesa STK, Till, Paybill, phone number, Paystack, and voucher redemption.</p>
          </article>
          <article className="panel">
            <h3>Session Policies</h3>
            <p>MAC/IP tracking, automatic expiry, and reconnect support before session end.</p>
          </article>
        </section>

        <section className="grid landing-card-grid">
          {capabilities.map((item) => (
            <article key={item.title} className="panel landing-feature-card">
              <h3>{item.title}</h3>
              <p>{item.desc}</p>
            </article>
          ))}
        </section>

        <section className="panel landing-flow">
          <h2>Customer Connection Flow</h2>
          <div className="landing-flow-grid">
            <article>
              <span>1</span>
              <h4>Join WiFi</h4>
              <p>User connects and captive portal opens automatically.</p>
            </article>
            <article>
              <span>2</span>
              <h4>Select Package</h4>
              <p>User picks package first, then proceeds to checkout.</p>
            </article>
            <article>
              <span>3</span>
              <h4>Enter Number</h4>
              <p>Phone number is entered on checkout page and STK prompt is triggered.</p>
            </article>
            <article>
              <span>4</span>
              <h4>Get Connected</h4>
              <p>Payment is verified and internet access is granted instantly.</p>
            </article>
          </div>
        </section>

        <section className="panel" style={{ padding: 20, marginTop: 16 }}>
          <h2 style={{ fontSize: "1.3rem", marginBottom: 8 }}>Deployment Checklist</h2>
          <ul style={{ margin: 0, color: "var(--muted)", paddingLeft: 20, display: "grid", gap: 6 }}>
            <li>Use Firestore with service account credentials for persistence.</li>
            <li>Set production HTTPS and callback URLs for payment verification.</li>
            <li>Add at least one MikroTik and download/import its generated RouterOS script.</li>
            <li>Set package plans and payment destination per MikroTik before going live.</li>
          </ul>
        </section>
      </main>
    </>
  );
}
