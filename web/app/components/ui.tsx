import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

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
      {/* De knoppen stonden op flex:none met een inline stijl, en dat wint van
          elke media query: op een telefoon liepen twee keuzerijen naast elkaar
          149 pixels buiten het scherm. Nu mogen ze afbreken. */}
      {action && <div className="card__head__actie">{action}</div>}
    </header>
  );
}

/* ── kpi ────────────────────────────────────────────────────────────────── */

export function Kpi({
  icon, tone = "neutral", label, value, note, delta, spark,
}: {
  icon: ReactNode;
  tone?: "control" | "test" | "neutral";
  label: string;
  value: string;
  note?: ReactNode;
  delta?: ReactNode;
  /**
   * Een sparkline onderaan de kaart. Optioneel, want lang niet elk kengetal
   * heeft een verloop dat iets zegt - een totaal aantal bezoekers stijgt per
   * definitie, en die lijn tekenen voegt niets toe.
   */
  spark?: ReactNode;
}) {
  return (
    <article className={"card kpi" + (spark ? " kpi--spark" : "")}>
      <div className="kpi__top">
        <span className={"chip chip--" + tone}>{icon}</span>
        {delta}
      </div>
      <p className="kpi__label">{label}</p>
      <p className="kpi__value num">{value}</p>
      {note && <p className="kpi__note">{note}</p>}
      {/* Onderaan en over de volle breedte: de sparkline is achtergrond bij het
          cijfer, geen tweede kolom die erom concurreert. */}
      {spark && <div className="kpi__spark">{spark}</div>}
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
/**
 * Het verschil met de vorige periode.
 *
 * PRECISIE NAAR DE GROOTTE VAN HET GETAL
 * "+1.100,8%" is negen tekens precisie die niemand leest, en het chipje werd er
 * 102 pixels breed van - breder dan de naam ernaast en drie keer het getal
 * waar het over gaat. Boven de duizend procent is het antwoord "heel veel meer"
 * en niet een decimaal; boven de honderd hoeft die decimaal ook niet.
 *
 * De exacte waarde staat in de tooltip, voor als je hem toch wilt weten.
 */
export function Delta({ waarde, goedAls = "up" }: { waarde: number; goedAls?: "up" | "down" | "geen" }) {
  const groot = Math.abs(waarde) >= 1000;
  const tekst = groot
    ? (waarde > 0 ? ">999%" : "<-999%")
    : (waarde >= 0 ? "+" : "") +
      waarde.toLocaleString("en-US", {
        minimumFractionDigits: Math.abs(waarde) >= 100 ? 0 : 1,
        maximumFractionDigits: Math.abs(waarde) >= 100 ? 0 : 1,
      }) + "%";
  const exact = (waarde >= 0 ? "+" : "") +
    waarde.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";

  if (goedAls === "geen" || Math.abs(waarde) < 0.05) {
    return <span className="delta delta--flat num" title={exact}>{tekst}</span>;
  }
  const omhoog = waarde >= 0;
  const goed = omhoog === (goedAls === "up");
  return (
    <span className={"delta num delta--" + (goed ? "up" : "down")} title={exact}>
      {omhoog ? <IconUp /> : <IconDown />}
      {tekst}
    </span>
  );
}

/**
 * Een keuze die te lang is om op het scherm zelf te passen.
 *
 * Dertien templates naast elkaar op de instelpagina lazen als een rooster
 * waarin je moest zoeken; hier hebben ze de ruimte om een lijst te zijn, en
 * blijft de pagina eronder de vergelijking tonen waar het om gaat.
 */
export function Modal({
  titel, sub, onSluit, children, voet,
}: {
  titel: string;
  sub?: string;
  onSluit: () => void;
  children: ReactNode;
  voet?: ReactNode;
}) {
  const [gemonteerd, setGemonteerd] = useState(false);
  useEffect(() => setGemonteerd(true), []);

  // Escape sluit. Zonder dit is de enige uitweg het kruisje, en dat is precies
  // wat mensen niet zoeken als ze zich vergist hebben.
  useEffect(() => {
    const opToets = (e: KeyboardEvent) => { if (e.key === "Escape") onSluit(); };
    document.addEventListener("keydown", opToets);
    return () => document.removeEventListener("keydown", opToets);
  }, [onSluit]);

  /**
   * In een portal naar body, en dat is niet optioneel.
   *
   * position: fixed rekent tegen de dichtstbijzijnde voorouder met een
   * transform, niet tegen het scherm. De wizard-stappen schuiven in met een
   * transform, dus een modaal dáárbinnen dekte alleen het tabblok af: een
   * overlay van 316 pixels hoog, midden op de pagina, met een lijst die niet
   * verder kon groeien dan een derde van wat hij nodig had.
   *
   * Gemeten voordat dit erin ging, anders was het niet opgevallen: het zag er
   * op het eerste gezicht uit als een modaal die gewoon klein was.
   */
  if (!gemonteerd) return null;

  return createPortal((
    <div className="modaal" role="dialog" aria-modal="true" aria-label={titel}
         onClick={(e) => { if (e.target === e.currentTarget) onSluit(); }}>
      <div className="modaal__paneel">
        <div className="modaal__kop">
          <div>
            <h3 className="modaal__titel">{titel}</h3>
            {sub && <p className="modaal__sub">{sub}</p>}
          </div>
          <button type="button" className="modaal__sluit" onClick={onSluit} aria-label="Close">×</button>
        </div>
        <div className="modaal__body">{children}</div>
        {voet && <div className="modaal__voet">{voet}</div>}
      </div>
    </div>
  ), document.body);
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
      {/* De ondergrens van 1.5% houdt een heel klein aandeel zichtbaar, maar
          geldt niet voor nul: een streepje bij 0 leest als 'een beetje'. */}
      <span style={{ width: (value > 0 ? Math.max(Math.min(value, 1) * 100, 1.5) : 0) + "%", background: color }} />
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

/**
 * One metric, both groups, side by side.
 *
 * A single big number with the other group in small print underneath reads as
 * "the answer" — and half the time it is the wrong half. In an A/B test every
 * figure only means something as a pair, so both are shown at the same weight
 * with their own colour, and the difference sits beside them rather than
 * replacing them.
 */
export function Vergelijk({
  label, control, test, delta, noot, goedAls = "up",
}: {
  label: string;
  control: string;
  test: string;
  delta?: number;
  noot?: string;
  goedAls?: "up" | "down" | "geen";
}) {
  return (
    <article className="card compare">
      <p className="compare__label">{label}</p>
      <div className="compare__row">
        <div className="compare__side">
          <span className="legend__item"><span className="swatch swatch--control" />Control</span>
          <p className="compare__value num">{control}</p>
        </div>
        <div className="compare__side">
          <span className="legend__item"><span className="swatch swatch--test" />Test</span>
          <p className="compare__value num">{test}</p>
        </div>
        {delta !== undefined && (
          <div className="compare__delta"><Delta waarde={delta} goedAls={goedAls} /></div>
        )}
      </div>
      {noot && <p className="compare__note">{noot}</p>}
    </article>
  );
}

/**
 * Tab bar.
 *
 * The analytics screen used to be one long column: to compare two figures you
 * had to scroll past everything in between, which is exactly when a comparison
 * stops being one. Splitting it means each view fits on a screen and you can
 * flick between them instead of hunting.
 */
export function Tabs<T extends string>({
  value, options, onChange,
}: {
  value: T;
  options: { key: T; label: string; telling?: number }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="tab"
          aria-selected={o.key === value}
          onClick={() => onChange(o.key)}
        >
          {o.label}
          {o.telling !== undefined && o.telling > 0 && (
            <span className="tabs__telling num">{o.telling}</span>
          )}
        </button>
      ))}
    </div>
  );
}
