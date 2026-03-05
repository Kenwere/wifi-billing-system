"use client";

import Link from "next/link";

interface NavbarProps {
  title?: string;
  showLogo?: boolean;
  links?: Array<{ label: string; href: string }>;
  authLinks?: Array<{ label: string; href: string; variant?: "primary" | "secondary" }>;
  userMenu?: { name: string; role: string; onLogout: () => void };
}

export function Navbar({
  title = "WiFi Hotspot",
  showLogo = true,
  links = [],
  authLinks = [],
  userMenu,
}: NavbarProps) {
  return (
    <nav
      style={{
        background: "#fff",
        color: "var(--text)",
        padding: "0 20px",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <div
        style={{
          maxWidth: 1300,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          minHeight: 60,
          gap: 12,
          flexWrap: "wrap",
          padding: "10px 0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          {showLogo && (
            <Link
              href="/"
              style={{ fontSize: "1.1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "999px",
                  background: "var(--primary)",
                  display: "inline-block",
                }}
              />
              {title}
            </Link>
          )}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {links.map((link) => (
              <Link key={link.href} href={link.href} style={{ fontSize: "0.9rem" }}>
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        {userMenu && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
              {userMenu.name} ({userMenu.role})
            </span>
            <button
              onClick={userMenu.onLogout}
              className="btn btn-secondary"
              style={{ padding: "6px 10px" }}
            >
              Logout
            </button>
          </div>
        )}

        {!userMenu && authLinks.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {authLinks.map((item) => (
              <Link
                key={item.href + item.label}
                href={item.href}
                className={`btn ${item.variant === "secondary" ? "btn-secondary" : "btn-primary"}`}
                style={{ padding: "6px 10px" }}
              >
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </nav>
  );
}
