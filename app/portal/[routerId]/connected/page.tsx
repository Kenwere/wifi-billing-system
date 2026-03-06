"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

async function jfetch(url: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed: ${res.status}`);
  return data;
}

export default function ConnectedPage() {
  const params = useParams<{ routerId: string }>();
  const search = useSearchParams();
  const routerId = params?.routerId ?? "";
  const phone = search.get("phone") ?? "";
  const mac = search.get("mac") ?? "";
  const [message, setMessage] = useState("connected");

  useEffect(() => {
    if (!routerId) return;
    const qs = new URLSearchParams({ routerId });
    if (phone) qs.set("phone", phone);
    if (mac) qs.set("macAddress", mac);
    void jfetch(`/api/portal/status?${qs.toString()}`)
      .then(() => setMessage("connected"))
      .catch(() => setMessage("connected"));
  }, [routerId, phone, mac]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#fff",
        color: "#111",
        fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
      }}
    >
      <h1 style={{ fontSize: "2rem", fontWeight: 700, margin: 0 }}>{message}</h1>
    </main>
  );
}
