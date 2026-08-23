import { metricInfo, type MetricKey, type MetriekInvoer } from "./metrics";
import type { Toets } from "./stats";

/**
 * Wint de variant overal, of alleen ergens?
 *
 * Dit is waar een segmenttabblad voor bestaat, en precies wat er niet stond.
 * Een test die overall +5% doet maar op mobiel -12% en op desktop +18% is
 * geen winnaar die je uitrolt; het is twee verschillende uitkomsten die in
 * één gemiddelde zijn verdwenen. Op deze winkel is dat geen theorie - het
 * merendeel van het verkeer is mobiel, dus een desktopwinst kan het cijfer
 * optillen terwijl de meeste bezoekers er slechter van worden.
 *
 * WAAROM DIT GEEN BESLISGROND IS
 * Segmenten opdelen is dezelfde val als vijf metrieken naast elkaar leggen:
 * hoe meer je er bekijkt, hoe groter de kans dat er eentje toevallig
 * significant is. Vier segmenten op 95% geeft al ~19% kans op een vals
 * alarm. Daarom noemt dit scherm een segment nooit een winnaar - het wijst
 * alleen aan wanneer een segment de andere kant op wijst dan het geheel,
 * als reden om beter te kijken. Niet als reden om te besluiten.
 */

export type SegmentRij = {
  /** Waarde van het segment: "mobile", "US", "nl-market". */
  naam: string;
  controle: MetriekInvoer;
  test: MetriekInvoer;
  toets: Toets;
  /** Aantal waarnemingen in de kleinste groep - zegt of dit iets voorstelt. */
  kleinste: number;
  /**
   * Wijst dit segment de andere kant op dan het geheel?
   *
   * Alleen als beide kanten iets voorstellen: een segment met vier orders dat
   * "de andere kant op wijst" is ruis met een label.
   */
  tegendraads: boolean;
};

export type SegmentDimensie = "device" | "currency" | "market";

export const DIMENSIES: { key: SegmentDimensie; label: string; leeg: string }[] = [
  { key: "device", label: "Device", leeg: "No device data yet. The theme snippet started sending this recently — it fills in from here on." },
  { key: "currency", label: "Currency", leeg: "No orders with a currency yet." },
  { key: "market", label: "Market", leeg: "No market data yet." },
];

/**
 * Kan deze dimensie deze metriek dragen?
 *
 * Valuta komt uit de orders bij Shopify en kent dus geen bezoekers. Alles wat
 * per bezoeker telt - omzet per bezoeker, conversie, add-to-cart - heeft daar
 * geen noemer. Dat gaf een tabel vol streepjes die eruitzag alsof er te weinig
 * data was, terwijl de vraag simpelweg niet te stellen is op deze bron.
 */
export function dimensieKan(dim: SegmentDimensie, metriek: MetricKey): boolean {
  if (dim !== "currency") return true;
  return metriek === "aov" || metriek === "sub_rate";
}

export function waaromNiet(dim: SegmentDimensie, metriek: MetricKey): string {
  return (
    "Currency comes from the orders in Shopify, which carry no visitor count, so " +
    metricInfo(metriek).naam.toLowerCase() + " cannot be worked out per currency. " +
    "Average order value and subscription share can — or use device or market, which are " +
    "measured on the storefront and do count visitors."
  );
}

export const LEEG: MetriekInvoer = {
  visitors: 0, atc: 0, orders: 0, revenueCents: 0, revenueSqCents: 0, subOrders: 0,
};

export function telSamen(a: MetriekInvoer, b: MetriekInvoer): MetriekInvoer {
  return {
    visitors: a.visitors + b.visitors,
    atc: a.atc + b.atc,
    orders: a.orders + b.orders,
    revenueCents: a.revenueCents + b.revenueCents,
    revenueSqCents: a.revenueSqCents + b.revenueSqCents,
    subOrders: a.subOrders + b.subOrders,
  };
}

/**
 * Segmentrijen bouwen en toetsen.
 *
 * De drempel van dertig ligt bewust laag: bij minder is de toets toch niet
 * bruikbaar en zegt de rij alleen nog "te weinig". Hem helemaal weglaten zou
 * erger zijn - dan lijkt het segment niet te bestaan.
 */
export function bouwSegmenten(
  ruw: Record<string, { control: MetriekInvoer; test: MetriekInvoer }>,
  metriek: MetricKey,
  betrouwbaarheid: number,
  overallLift: number,
): SegmentRij[] {
  const info = metricInfo(metriek);

  return Object.keys(ruw)
    .map((naam) => {
      const { control, test } = ruw[naam];
      const toets = info.toets(control, test, betrouwbaarheid);
      const kleinste = Math.min(control.visitors || control.orders, test.visitors || test.orders);

      // Tegendraads is alleen interessant als het geheel een richting heeft en
      // het segment er genoeg van heeft om iets te betekenen.
      const tegendraads =
        toets.bruikbaar &&
        Math.abs(overallLift) > 1 &&
        Math.sign(toets.lift) !== Math.sign(overallLift) &&
        Math.abs(toets.lift) > 5;

      return { naam, controle: control, test, toets, kleinste, tegendraads };
    })
    .sort((a, b) => b.kleinste - a.kleinste);
}
