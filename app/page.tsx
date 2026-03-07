"use client";

import Link from "next/link";
import { Navbar } from "@/components/Navbar";

const capabilities = [
  {
    title: "Hotspot Billing Management",
    desc: "Create and manage package plans by duration with automatic session expiry and reconnection capabilities.",
  },
  {
    title: "MikroTik Router Integration",
    desc: "Control multiple MikroTik devices with per-router package assignments, automated scripts, and payment configurations.",
  },
  {
    title: "Payment Processing",
    desc: "Integrate M-Pesa and Paystack payment gateways with transaction verification and voucher redemption systems.",
  },
  {
    title: "Business Analytics Dashboard",
    desc: "Monitor active sessions, payment records, user rankings, and revenue metrics with comprehensive reporting tools.",
  },
];

export default function Home() {
  return (
    <>
      <Navbar
        title="WiFi Billing"
        links={[]}
        authLinks={[
          { label: "Login", href: "/admin", variant: "secondary" },
          { label: "Register", href: "/admin?mode=register", variant: "primary" },
        ]}
      />

      <main className="shell" style={{ paddingTop: 24 }}>
        <section className="landing-hero">
          <div className="landing-hero-left">
            <p className="landing-kicker">Professional WiFi Billing and Hotspot Management</p>
            <h1>Streamline Your Hotspot Business Operations</h1>
            <p className="landing-subtext">
              Configure MikroTik hotspots, define service packages, process payments securely, and provide instant internet access to customers. Ideal for cafes, hotels, educational institutions, and public WiFi networks.
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
            <h3>Key Features</h3>
            <div className="landing-highlight-list">
              <div>
                <b>Automated Access Control</b>
                <p>Customers complete payment and receive internet access instantly without manual intervention.</p>
              </div>
              <div>
                <b>Multi-Location Support</b>
                <p>Manage multiple MikroTik installations with location-specific packages and payment configurations.</p>
              </div>
              <div>
                <b>Subscription Management</b>
                <p>Monitor trial periods, recurring fees, and account status through the administrative dashboard.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-stats">
          <article className="panel">
            <h3>Flexible Package Plans</h3>
            <p>Configure packages by time duration with bandwidth and data usage controls.</p>
          </article>
          <article className="panel">
            <h3>Payment Integration</h3>
            <p>Support for M-Pesa STK Push, Till Numbers, Paybill, and Paystack payment processing.</p>
          </article>
          <article className="panel">
            <h3>Session Management</h3>
            <p>MAC address and IP tracking with automatic session expiry and reconnection options.</p>
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
          <h2>Customer Connection Process</h2>
          <div className="landing-flow-grid">
            <article>
              <span>1</span>
              <h4>Network Connection</h4>
              <p>Customer connects to the WiFi network and the captive portal loads automatically.</p>
            </article>
            <article>
              <span>2</span>
              <h4>Package Selection</h4>
              <p>Customer reviews available packages and selects their preferred option.</p>
            </article>
            <article>
              <span>3</span>
              <h4>Payment Processing</h4>
              <p>Phone number is provided and payment is initiated through the selected gateway.</p>
            </article>
            <article>
              <span>4</span>
              <h4>Internet Access</h4>
              <p>Upon successful payment verification, internet access is granted immediately.</p>
            </article>
          </div>
        </section>
      </main>
    </>
  );
}
