"use client";

import { Navbar } from "@/components/Navbar";

const capabilities = [
  {
    title: "Hotspot Billing",
    desc: "Sell internet packages by minutes, hours, days, and weeks with automated session expiry.",
  },
  {
    title: "Router Management",
    desc: "Add and manage multiple MikroTik routers with separate package and payment settings.",
  },
  {
    title: "Payment Processing",
    desc: "M-Pesa STK flow, voucher redemption, payment logs, and subscription billing controls.",
  },
  {
    title: "Operations Dashboard",
    desc: "Track active sessions, earnings trends, user ranking, and service status in real time.",
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
        <section className="panel" style={{ padding: 28, marginBottom: 16 }}>
          <p style={{ margin: 0, color: "var(--primary)", fontWeight: 600, fontSize: "0.9rem" }}>
            Professional WiFi Hotspot Platform
          </p>
          <h1 style={{ fontSize: "2.2rem", marginTop: 6 }}>Deploy, bill, and manage internet access at scale</h1>
          <p style={{ color: "var(--muted)", maxWidth: 860, marginBottom: 0 }}>
            Built for ISPs, hostels, cafes, and public networks that need reliable hotspot billing, secure access
            control, and centralized operations. Configure routers, publish packages, receive payments, and monitor
            performance in one system.
          </p>
        </section>

        <section className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", marginBottom: 16 }}>
          {capabilities.map((item) => (
            <article key={item.title} className="panel" style={{ padding: 18 }}>
              <h3 style={{ marginBottom: 8 }}>{item.title}</h3>
              <p style={{ margin: 0, color: "var(--muted)" }}>{item.desc}</p>
            </article>
          ))}
        </section>

        <section className="panel" style={{ padding: 20, marginBottom: 16 }}>
          <h2 style={{ fontSize: "1.3rem", marginBottom: 8 }}>How the user flow works</h2>
          <ol style={{ margin: 0, color: "var(--muted)", paddingLeft: 20 }}>
            <li>User joins WiFi and opens portal.</li>
            <li>User can redeem voucher or select a package.</li>
            <li>User enters phone number and receives payment prompt.</li>
            <li>After payment verification, internet is activated automatically.</li>
          </ol>
        </section>

        <section className="panel" style={{ padding: 20 }}>
          <h2 style={{ fontSize: "1.3rem", marginBottom: 8 }}>Deployment notes</h2>
          <ul style={{ margin: 0, color: "var(--muted)", paddingLeft: 20 }}>
            <li>Use Firestore with service account credentials for persistence.</li>
            <li>Set production HTTPS and callback URLs for payment verification.</li>
            <li>Configure at least one router and payment destination before launch.</li>
          </ul>
        </section>
      </main>
    </>
  );
}
