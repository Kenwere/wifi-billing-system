"use client";

import Link from "next/link";
import { Navbar } from "@/components/Navbar";

const capabilities = [
  {
    title: "Hotspot Billing Management",
    desc: "Design and deploy service packages with configurable access duration, automatic session management, and transparent billing.",
  },
  {
    title: "MikroTik Infrastructure",
    desc: "Unified control across multiple router devices with enterprise-grade configuration, package assignment, and automation.",
  },
  {
    title: "Secure Payment Processing",
    desc: "PCI-compliant payment handling through M-Pesa and Paystack with transaction verification and voucher systems.",
  },
  {
    title: "Business Intelligence",
    desc: "Comprehensive dashboards tracking revenue, user metrics, active sessions, and performance analytics in real-time.",
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
            <p className="landing-kicker">Enterprise WiFi Revenue Management Platform</p>
            <h1>Monetize Your WiFi Network with Confidence</h1>
            <p className="landing-subtext">
              Deploy secure payment-gated WiFi access with integrated billing, automated revenue collection, and comprehensive business intelligence. Designed for hospitality, education, retail, and service providers managing high-traffic networks.
            </p>
            <div className="landing-cta-row">
              <Link href="/admin?mode=register" className="btn btn-primary">
                Get Started
              </Link>
              <Link href="/admin" className="btn btn-secondary">
                Login
              </Link>
            </div>
          </div>
          <div className="landing-hero-right panel">
            <h3>Core Capabilities</h3>
            <div className="landing-highlight-list">
              <div>
                <b>Frictionless Payment Integration</b>
                <p>Customers gain instant access upon successful payment with zero manual intervention required.</p>
              </div>
              <div>
                <b>Multi-Location Management</b>
                <p>Centralize control across multiple MikroTik devices with location-specific configurations and pricing.</p>
              </div>
              <div>
                <b>Real-Time Analytics</b>
                <p>Track active connections, revenue streams, and customer engagement through an intuitive dashboard.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-stats">
          <article className="panel">
            <h3>Tiered Pricing Plans</h3>
            <p>Create customizable packages with time-based access, bandwidth limits, and usage controls.</p>
          </article>
          <article className="panel">
            <h3>Global Payment Processing</h3>
            <p>Seamless integration with M-Pesa and Paystack for secure, verified transactions at scale.</p>
          </article>
          <article className="panel">
            <h3>Advanced Session Control</h3>
            <p>Device tracking, automatic expiry enforcement, and seamless reconnection capabilities.</p>
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
          <h2>Customer Access Flow</h2>
          <div className="landing-flow-grid">
            <article>
              <span>1</span>
              <h4>Network Discovery</h4>
              <p>Customer connects to the WiFi network and is presented with a secure authentication portal.</p>
            </article>
            <article>
              <span>2</span>
              <h4>Plan Selection</h4>
              <p>User reviews available service packages and duration options for their requirements.</p>
            </article>
            <article>
              <span>3</span>
              <h4>Payment Authorization</h4>
              <p>Customer initiates secure payment through their preferred gateway with verification.</p>
            </article>
            <article>
              <span>4</span>
              <h4>Immediate Access</h4>
              <p>Upon confirmed payment, full internet access is activated instantly and automatically.</p>
            </article>
          </div>
        </section>
      </main>
    </>
  );
}
