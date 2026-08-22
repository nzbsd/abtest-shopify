import type { CohortCijfers } from "./stats";

/**
 * Rijen uit de views omzetten naar cijfers per groep.
 *
 * Deze module is bewust vrij van React en van Supabase: hij krijgt rijen en
 * geeft getallen terug. Zo rekenen het ingebedde scherm in Shopify en het losse
 * dashboard gegarandeerd hetzelfde uit - twee kopieën van deze logica zouden
 * vroeg of laat uit elkaar lopen en dan zie je op twee plekken een ander
 * antwoord op dezelfde vraag.
 */

export type StatRij = {
  test_id: number;
  cohort: string;
  market: string | null;
  views: number;
  add_to_carts: number;
  orders: number;
  revenue_cents: number;
  visitors: number;
  revenue_sq_cents: number;
  first_event_at: string | null;
  last_event_at: string | null;
};

export type DagRij = {
  test_id: number;
  cohort: string;
  dag: string;
  views: number;
  add_to_carts: number;
  orders: number;
  revenue_cents: number;
  visitors: number;
};

export type Groep = CohortCijfers & {
  views: number;
  atc: number;
  /** Omzet per bezoeker, in valuta-eenheden. */
  rpv: number;
  /** Conversie in procenten. */
  cr: number;
  /** Aandeel bezoekers dat iets in de cart legde, in procenten. */
  atcRatio: number;
  /** Gemiddelde orderwaarde. */
  aov: number;
};

const n = (v: unknown) => Number(v) || 0;

export function telOp(rijen: StatRij[], cohort: string): Groep {
  const g = rijen.filter((r) => r.cohort === cohort);
  const som = (k: keyof StatRij) => g.reduce((a, r) => a + n(r[k]), 0);

  const visitors = som("visitors");
  const orders = som("orders");
  const revenueCents = som("revenue_cents");
  const atc = som("add_to_carts");

  return {
    visitors,
    orders,
    revenueCents,
    revenueSqCents: som("revenue_sq_cents"),
    views: som("views"),
    atc,
    rpv: visitors ? revenueCents / 100 / visitors : 0,
    cr: visitors ? (orders / visitors) * 100 : 0,
    atcRatio: visitors ? (atc / visitors) * 100 : 0,
    aov: orders ? revenueCents / 100 / orders : 0,
  };
}

export type Punt = { dag: string; control: number; test: number };

/** Dagreeks voor een gekozen maat, met alle dagen aanwezig ook als er niets gebeurde. */
export function dagReeks(
  rijen: DagRij[],
  maat: "rpv" | "cr" | "orders" | "visitors",
): Punt[] {
  const dagen = Array.from(new Set(rijen.map((r) => r.dag))).sort();

  const waarde = (r: DagRij | undefined) => {
    if (!r) return 0;
    const bez = n(r.visitors);
    switch (maat) {
      case "rpv": return bez ? n(r.revenue_cents) / 100 / bez : 0;
      case "cr": return bez ? (n(r.orders) / bez) * 100 : 0;
      case "orders": return n(r.orders);
      case "visitors": return bez;
    }
  };

  return dagen.map((dag) => ({
    dag,
    control: waarde(rijen.find((r) => r.dag === dag && r.cohort === "control")),
    test: waarde(rijen.find((r) => r.dag === dag && r.cohort === "test")),
  }));
}

/** Rijen beperken tot de laatste N dagen; 0 betekent alles. */
export function beperkTotDagen<T extends { dag: string }>(rijen: T[], dagen: number): T[] {
  if (!dagen) return rijen;
  const grens = new Date(Date.now() - dagen * 864e5).toISOString().slice(0, 10);
  return rijen.filter((r) => r.dag >= grens);
}

/** Hoe lang de test al loopt, in hele dagen. */
export function looptDagen(start: string | null | undefined): number | null {
  if (!start) return null;
  const ms = Date.now() - new Date(start).getTime();
  return ms > 0 ? Math.floor(ms / 864e5) : 0;
}

/* ── formatting ─────────────────────────────────────────────────────────── */

/* en-US throughout: this store prices in USD and the interface is English, so
   1,234.56 rather than 1.234,56. */
export const geld = (v: number) =>
  v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const heel = (v: number) => Math.round(v).toLocaleString("en-US");

export const procent = (v: number, decimalen = 2) =>
  v.toLocaleString("en-US", { minimumFractionDigits: decimalen, maximumFractionDigits: decimalen }) + "%";

export const ondertekend = (v: number, decimalen = 1) =>
  (v >= 0 ? "+" : "") +
  v.toLocaleString("en-US", { minimumFractionDigits: decimalen, maximumFractionDigits: decimalen }) + "%";

export function korteDatum(d: string) {
  return new Date(d).toLocaleDateString("en-US", { day: "numeric", month: "short" });
}
