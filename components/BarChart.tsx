"use client";

type Item = { label: string; value: number };

export function BarChart({ title, items }: { title: string; items: Item[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="panel" style={{ padding: 14 }}>
      <h3 style={{ marginBottom: 10 }}>{title}</h3>
      <div className="grid">
        {items.map((item) => (
          <div key={item.label}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ color: "var(--muted)" }}>{item.label}</span>
              <b>KSH {item.value.toLocaleString()}</b>
            </div>
            <div style={{ height: 8, background: "var(--line)", borderRadius: 99, overflow: "hidden" }}>
              <div
                style={{
                  width: `${(item.value / max) * 100}%`,
                  height: "100%",
                  background:
                    "linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent-2) 70%, white))",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
