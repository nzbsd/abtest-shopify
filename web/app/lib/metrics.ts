import {
  benodigdVoorGemiddelde, benodigdVoorVerhouding,
  toetsAandeel, toetsConversie, toetsGemiddelde, toetsOmzetPerBezoeker, type Toets,
} from "./stats";

/**
 * Waarop een test besloten wordt.
 *
 * Dit was hardgecodeerd op omzet per bezoeker. Dat is de juiste standaard voor
 * een prijstest, en de verkeerde voor bijna al het andere. Een test op de
 * indeling van een pagina gaat over of mensen doorklikken; die afrekenen op
 * omzet per bezoeker betekent wachten op een signaal dat tien keer zo veel
 * verkeer vraagt als de vraag die je stelde.
 *
 * WAAROM ÉÉN HOOFDMETRIEK
 * Omdat je anders achteraf kiest welke het beste uitkomt. Vijf metrieken
 * bekijken en de significante uitroepen tot uitslag geeft bij vijf onafhankelijke
 * metrieken ongeveer 23% kans op een "winnaar" terwijl er niets aan de hand is
 * (1 - 0,95^5). De hoofdmetriek leg je daarom vooraf vast; de rest staat er ter
 * informatie bij, expliciet niet als beslisgrond.
 *
 * GUARDRAILS ZIJN IETS ANDERS
 * Die kijken de andere kant op: niet "is het beter" maar "is het niet stiekem
 * veel slechter". Bij een prijstest is het abonnementsaandeel de klassieke -
 * meer omzet vandaag is een slechte ruil tegen minder abonnees. Een guardrail
 * hoeft niet significant te winnen; hij mag alleen niet significant verliezen.
 */

export type MetricKey = "rpv" | "cvr" | "aov" | "sub_rate" | "atc";

/** Alles wat een metriek nodig heeft, per groep. */
export type MetriekInvoer = {
  visitors: number;
  atc: number;
  orders: number;
  revenueCents: number;
  /** Som van kwadraten van de orderbedragen. Nodig voor de spreiding. */
  revenueSqCents: number;
  subOrders: number;
};

export type MetricInfo = {
  key: MetricKey;
  naam: string;
  kort: string;
  /** Waarom je hier op zou besluiten, en wanneer juist niet. */
  uitleg: string;
  /** Hoe de waarde eruitziet: geld, percentage. */
  vorm: "geld" | "procent";
  /** Wat de toets onder water doet - staat in het scherm zodat het geen magie is. */
  toetsnaam: string;
  waarde: (g: MetriekInvoer) => number;
  toets: (c: MetriekInvoer, t: MetriekInvoer, betrouwbaarheid: number) => Toets;
  /**
   * Hoeveel verkeer dit ongeveer vraagt, ten opzichte van conversie.
   * Alleen om het scherm eerlijk te laten waarschuwen, geen exacte wetenschap.
   */
  duur: "kort" | "middel" | "lang";
};

const deel = (a: number, b: number) => (b > 0 ? a / b : 0);

export const METRICS: MetricInfo[] = [
  {
    key: "rpv",
    naam: "Revenue per visitor",
    kort: "What a visitor is worth",
    uitleg:
      "Conversion and order value in one number, so a variant cannot win by trading one for the " +
      "other. The right default for anything that touches price. It is also the slowest to " +
      "settle: most visitors buy nothing, so the spread is enormous.",
    vorm: "geld",
    toetsnaam: "Welch t-test on per-visitor revenue",
    waarde: (g) => deel(g.revenueCents, g.visitors) / 100,
    toets: (c, t, b) => toetsOmzetPerBezoeker(c, t, b),
    duur: "lang",
  },
  {
    key: "cvr",
    naam: "Conversion rate",
    kort: "Share of visitors who buy",
    uitleg:
      "The fastest metric to reach a verdict, and the easiest to mislead yourself with on a price " +
      "test: a lower price nearly always converts better while earning less. Use it when the " +
      "price is not what changes.",
    vorm: "procent",
    toetsnaam: "Two-proportion z-test",
    waarde: (g) => deel(g.orders, g.visitors) * 100,
    toets: (c, t, b) => toetsConversie(c, t, b),
    duur: "kort",
  },
  {
    key: "aov",
    naam: "Average order value",
    kort: "What an order is worth",
    uitleg:
      "Only counts people who bought, so it says nothing about how many did. Good for testing " +
      "bundles, tiers and upsells; dangerous alone, because chasing away the cheap orders raises " +
      "it while revenue falls.",
    vorm: "geld",
    toetsnaam: "Welch t-test on order values",
    waarde: (g) => deel(g.revenueCents, g.orders) / 100,
    toets: (c, t, b) =>
      toetsGemiddelde(
        { som: c.revenueCents, somKwadraten: c.revenueSqCents, n: c.orders },
        { som: t.revenueCents, somKwadraten: t.revenueSqCents, n: t.orders },
        b,
      ),
    duur: "middel",
  },
  {
    key: "sub_rate",
    naam: "Subscription share",
    kort: "Share of orders on a plan",
    uitleg:
      "Of the people who bought, how many committed to a plan. The usual guardrail on a price " +
      "test: a higher price that wins today but costs subscribers can still lose over a customer " +
      "lifetime.",
    vorm: "procent",
    toetsnaam: "Two-proportion z-test on orders",
    waarde: (g) => deel(g.subOrders, g.orders) * 100,
    toets: (c, t, b) =>
      toetsAandeel(c.subOrders, c.orders, t.subOrders, t.orders, b),
    duur: "middel",
  },
  {
    key: "atc",
    naam: "Add-to-cart rate",
    kort: "Share of visitors who add to cart",
    uitleg:
      "Sits closest to the change itself, so it moves first and needs the least traffic. It stops " +
      "short of the checkout, though — a variant can win here and lose at the payment step.",
    vorm: "procent",
    toetsnaam: "Two-proportion z-test",
    waarde: (g) => deel(g.atc, g.visitors) * 100,
    toets: (c, t, b) => toetsAandeel(c.atc, c.visitors, t.atc, t.visitors, b),
    duur: "kort",
  },
];

export function metricInfo(k: string | null | undefined): MetricInfo {
  return METRICS.find((m) => m.key === k) ?? METRICS[0];
}

/**
 * Basisverhouding van een metriek in de controlegroep, als fractie.
 *
 * De steekproefberekening voor een percentage heeft die nodig: hoeveel
 * bezoekers je nodig hebt om 2% naar 2,2% te tillen verschilt enorm van 20%
 * naar 22%.
 */
export function basisFractie(m: MetricKey, c: MetriekInvoer): number {
  switch (m) {
    case "cvr":      return deel(c.orders, c.visitors);
    case "atc":      return deel(c.atc, c.visitors);
    case "sub_rate": return deel(c.subOrders, c.orders);
    default:         return 0;
  }
}

/** Noemer van de metriek: waar de steekproef in geteld wordt. */
export function noemer(m: MetricKey, g: MetriekInvoer): number {
  return m === "aov" || m === "sub_rate" ? g.orders : g.visitors;
}

/** "Visitors" of "orders" - zodat het scherm de juiste eenheid noemt. */
export function noemerNaam(m: MetricKey): string {
  return m === "aov" || m === "sub_rate" ? "orders" : "visitors";
}

/**
 * Hoeveel waarnemingen deze metriek nodig heeft, in dezelfde eenheid als
 * noemer() teruggeeft.
 *
 * Dat "dezelfde eenheid" is de hele reden dat deze functie bestaat. Het doel
 * werd eerder voor elke metriek in bezoekers uitgerekend en vergeleken met wat
 * er in de noemer van de metriek stond - bij orderwaarde dus bezoekers tegen
 * orders. Op een test met 900 bezoekers en 250 orders gaf dat 1% voortgang
 * waar 40% klopte, en niets aan het scherm verried welke van de twee je zag.
 */
export function benodigd(
  m: MetricKey,
  controle: MetriekInvoer,
  mdePct: number,
  betrouwbaarheid = 95,
): number {
  const info = metricInfo(m);
  if (info.vorm === "procent") {
    return benodigdVoorVerhouding(basisFractie(m, controle), mdePct, betrouwbaarheid);
  }
  // Omzet per bezoeker telt per bezoeker (niet-kopers als nul), orderwaarde
  // telt per order.
  const n = m === "aov" ? controle.orders : controle.visitors;
  return benodigdVoorGemiddelde(
    { som: controle.revenueCents, somKwadraten: controle.revenueSqCents, n },
    mdePct,
    betrouwbaarheid,
  );
}
