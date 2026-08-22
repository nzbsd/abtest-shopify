import type { ReactNode } from "react";

/* ── iconen ─────────────────────────────────────────────────────────────── */

const svg = (d: ReactNode, size = 19) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);

export const IconGrid   = () => svg(<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>);
export const IconChart  = () => svg(<><path d="M3 20h18" /><path d="M6 16V9" /><path d="M11 16V5" /><path d="M16 16v-4" /><path d="M21 16v-8" /></>);
export const IconFlask  = () => svg(<><path d="M9 3h6" /><path d="M10 3v6L4.5 18a2 2 0 0 0 1.7 3h11.6a2 2 0 0 0 1.7-3L14 9V3" /><path d="M7 15h10" /></>);
export const IconUsers  = () => svg(<><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 20v-2a4 4 0 0 0-3-3.9" /><path d="M16 3.1a4 4 0 0 1 0 7.8" /></>);
export const IconCart   = () => svg(<><circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.6 12.4a1.5 1.5 0 0 0 1.5 1.1h8.4a1.5 1.5 0 0 0 1.5-1.2L21 7H6" /></>);
export const IconCoins  = () => svg(<><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" /><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></>);
export const IconUp     = () => svg(<><path d="M7 14l5-5 5 5" /></>, 14);
export const IconDown   = () => svg(<><path d="M7 10l5 5 5-5" /></>, 14);
export const IconCheck  = () => svg(<><path d="M20 6L9 17l-5-5" /></>, 15);
export const IconAlert  = () => svg(<><circle cx="12" cy="12" r="9" /><path d="M12 8v5" /><path d="M12 16.5v.01" /></>, 15);

/* ── vlakken ────────────────────────────────────────────────────────────── */

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={"card " + className}>{children}</section>;
}

export function CardHead({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <header className="card__head">
      <div style={{ minWidth: 0 }}>
        <h2 className="card__title">{title}</h2>
        {sub && <p className="card__sub">{sub}</p>}
      </div>
      {action && <div style={{ flex: "none" }}>{action}</div>}
    </header>
  );
}

/* ── kpi ────────────────────────────────────────────────────────────────── */

export function Kpi({
  icon, tone = "neutral", label, value, note, delta,
}: {
  icon: ReactNode;
  tone?: "control" | "test" | "neutral";
  label: string;
  value: string;
  note?: ReactNode;
  delta?: ReactNode;
}) {
  return (
    <article className="card kpi">
      <div className="kpi__top">
        <span className={"chip chip--" + tone}>{icon}</span>
        {delta}
      </div>
      <p className="kpi__label">{label}</p>
      <p className="kpi__value num">{value}</p>
      {note && <p className="kpi__note">{note}</p>}
    </article>
  );
}

/**
 * Verschil-pil.
 *
 * goedAls bepaalt welke kant groen is. Bij een prijstest is dat niet altijd
 * "omhoog": een hogere prijs die de conversie verlaagt kan prima zijn zolang de
 * omzet stijgt, dus conversie kleuren we neutraal in plaats van rood.
 */
export function Delta({ waarde, goedAls = "up" }: { waarde: number; goedAls?: "up" | "down" | "geen" }) {
  const tekst = (waarde >= 0 ? "+" : "") +
    waarde.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";

  if (goedAls === "geen" || Math.abs(waarde) < 0.05) {
    return <span className="delta delta--flat num">{tekst}</span>;
  }
  const omhoog = waarde >= 0;
  const goed = omhoog === (goedAls === "up");
  return (
    <span className={"delta num delta--" + (goed ? "up" : "down")}>
      {omhoog ? <IconUp /> : <IconDown />}
      {tekst}
    </span>
  );
}

export function Segmented<T extends string>({
  value, options, onChange,
}: {
  value: T;
  options: { key: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.key} type="button" aria-pressed={o.key === value} onClick={() => onChange(o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Track({ value, color }: { value: number; color: string }) {
  return (
    <span className="track" aria-hidden>
      <span style={{ width: Math.max(Math.min(value, 1) * 100, 1.5) + "%", background: color }} />
    </span>
  );
}

export function Banner({
  tone = "info", children,
}: {
  tone?: "info" | "ok" | "warn" | "error";
  children: ReactNode;
}) {
  return (
    <div className={"banner banner--" + tone}>
      <span className="banner__accent" />
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

export function Badge({ status }: { status: string }) {
  const label = status === "running" ? "running" : status === "stopped" ? "stopped" : "draft";
  return (
    <span className={"badge badge--" + status}>
      {status === "running" && <span className="dot" />}
      {label}
    </span>
  );
}

export function Legend() {
  return (
    <div className="legend">
      <span className="legend__item"><span className="swatch swatch--control" />Control</span>
      <span className="legend__item"><span className="swatch swatch--test" />Test</span>
    </div>
  );
}

export function Leeg({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
