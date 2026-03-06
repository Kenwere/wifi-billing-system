"use client";

import Link from "next/link";
import { Navbar } from "@/components/Navbar";

export default function DocsPage() {
  return (
    <>
      <Navbar />
      <main className="shell" style={{ paddingTop: 24 }}>
        <section className="panel" style={{ padding: 20, marginBottom: 16 }}>
          <h1>Documentation</h1>
          <p style={{ color: "var(--muted)" }}>
            Admin dashboard, hotspot portal, payment APIs, router setup, and subscription billing.
          </p>
        </section>

        <section className="panel" style={{ padding: 20, marginBottom: 16 }}>
          <h2>Main Pages</h2>
          <ul>
            <li>Admin Dashboard: `/admin`</li>
            <li>Portal: `/portal/[routerId]`</li>
            <li>Portal Checkout: `/portal/[routerId]/checkout`</li>
          </ul>
        </section>

        <section className="panel" style={{ padding: 20, marginBottom: 16 }}>
          <h2>Key APIs</h2>
          <ul>
            <li>`GET/PATCH /api/tenant`</li>
            <li>`GET/POST/PATCH /api/routers`</li>
            <li>`GET/POST/PATCH /api/packages`</li>
            <li>`POST /api/payments/checkout`</li>
            <li>`POST /api/subscription/pay`</li>
            <li>`GET /api/subscription/verify`</li>
            <li>`GET /api/supabase/status`</li>
          </ul>
        </section>

        <section style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/admin" className="btn btn-primary">
            Admin Dashboard
          </Link>
          <Link href="/" className="btn btn-secondary">
            Home
          </Link>
        </section>
      </main>
    </>
  );
}
