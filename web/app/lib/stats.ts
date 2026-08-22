/**
 * Statistiek voor de prijstest.
 *
 * Waarom dit er is: een kaal "+14%" zegt niets zonder te weten hoe hard dat
 * cijfer is. Bij een paar honderd bezoekers per groep schommelt omzet per
 * bezoeker zo sterk dat een verschil van tien procent puur toeval kan zijn.
 * Een prijs veranderen op basis van ruis kost echt geld.
 *
 * Wat hier gebeurt:
 *   - omzet per bezoeker wordt getoetst met Welch (ongelijke varianties)
 *   - conversie met een toets op twee proporties
 *   - beide met een betrouwbaarheidsinterval, want een interval zegt meer dan
 *     een p-waarde: het laat zien hoe groot het effect ongeveer is
 *
 * Elke bezoeker die niets kocht telt als omzet 0. Dat is precies wat "omzet per
 * bezoeker" betekent, en het is de reden dat de spreiding zo groot is: de
 * meeste waarnemingen zijn nul en een enkele order is een uitschieter.
 */

/* Benadering van de normale verdelingsfunctie (Abramowitz & Stegun 26.2.17),
   fout < 7,5e-8. Ruim genoeg: we ronden p toch af op drie decimalen. */
function normaleCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p =
    d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

/** Tweezijdige p-waarde bij een z- of t-waarde. */
function tweezijdigeP(z: number): number {
  return 2 * (1 - normaleCdf(Math.abs(z)));
}

export type Toets = {
  /** Relatief verschil in procenten, test ten opzichte van controle. */
  lift: number;
  /** Ondergrens en bovengrens van dat verschil, 95% betrouwbaarheid. */
  onder: number;
  boven: number;
  p: number;
  significant: boolean;
  /** Genoeg waarnemingen om de toets te vertrouwen? */
  bruikbaar: boolean;
};

const Z95 = 1.959964;

export type CohortCijfers = {
  visitors: number;
  orders: number;
  revenueCents: number;
  /** Som van de kwadraten van de orderbedragen, in centen. Nodig voor de spreiding. */
  revenueSqCents: number;
};

/**
 * Omzet per bezoeker, getoetst met Welch.
 *
 * Gemiddelde = totale omzet / bezoekers. Voor de variantie tellen alle
 * bezoekers mee, ook de nul-omzetters: som van kwadraten gedeeld door n, min
 * het gemiddelde in het kwadraat.
 */
export function toetsOmzetPerBezoeker(c: CohortCijfers, t: CohortCijfers): Toets {
  const stat = (g: CohortCijfers) => {
    const n = g.visitors;
    if (n < 2) return { n, gem: 0, var: 0 };
    const gem = g.revenueCents / n;
    // E[x²] - E[x]², daarna de correctie naar de steekproefvariantie.
    const ruw = g.revenueSqCents / n - gem * gem;
    return { n, gem, var: Math.max(0, ruw) * (n / (n - 1)) };
  };

  const a = stat(c);
  const b = stat(t);
  const bruikbaar = a.n >= 30 && b.n >= 30 && (a.var > 0 || b.var > 0);

  if (!bruikbaar) {
    const lift = a.gem > 0 ? ((b.gem - a.gem) / a.gem) * 100 : 0;
    return { lift, onder: 0, boven: 0, p: 1, significant: false, bruikbaar: false };
  }

  const se = Math.sqrt(a.var / a.n + b.var / b.n);
  const verschil = b.gem - a.gem;
  const p = se > 0 ? tweezijdigeP(verschil / se) : 1;

  // Interval om het absolute verschil, daarna omgerekend naar procenten van de
  // controlegroep. Dat is benaderend - het interval om een verhouding is niet
  // symmetrisch - maar bij deze aantallen is het verschil verwaarloosbaar en
  // veel makkelijker te lezen.
  const marge = Z95 * se;
  const basis = a.gem || 1;

  return {
    lift: (verschil / basis) * 100,
    onder: ((verschil - marge) / basis) * 100,
    boven: ((verschil + marge) / basis) * 100,
    p,
    significant: p < 0.05,
    bruikbaar: true,
  };
}

/** Conversie, getoetst op twee proporties. */
export function toetsConversie(c: CohortCijfers, t: CohortCijfers): Toets {
  const pa = c.visitors ? c.orders / c.visitors : 0;
  const pb = t.visitors ? t.orders / t.visitors : 0;

  // Vuistregel: minstens vijf verwachte successen en mislukkingen per groep,
  // anders is de normale benadering niet te vertrouwen.
  const bruikbaar =
    c.visitors >= 30 && t.visitors >= 30 && c.orders >= 5 && t.orders >= 5;

  if (!bruikbaar) {
    return {
      lift: pa > 0 ? ((pb - pa) / pa) * 100 : 0,
      onder: 0, boven: 0, p: 1, significant: false, bruikbaar: false,
    };
  }

  // Voor de p-waarde de gepoolde proportie (toetsen onder de aanname dat de
  // groepen gelijk zijn); voor het interval de ongepoolde, want daar toetsen
  // we niet maar schatten we.
  const pool = (c.orders + t.orders) / (c.visitors + t.visitors);
  const sePool = Math.sqrt(pool * (1 - pool) * (1 / c.visitors + 1 / t.visitors));
  const p = sePool > 0 ? tweezijdigeP((pb - pa) / sePool) : 1;

  const se = Math.sqrt((pa * (1 - pa)) / c.visitors + (pb * (1 - pb)) / t.visitors);
  const marge = Z95 * se;
  const basis = pa || 1;

  return {
    lift: ((pb - pa) / basis) * 100,
    onder: ((pb - pa - marge) / basis) * 100,
    boven: ((pb - pa + marge) / basis) * 100,
    p,
    significant: p < 0.05,
    bruikbaar: true,
  };
}

/**
 * Hoeveel bezoekers per groep nodig zijn om een verschil van deze omvang in
 * OMZET PER BEZOEKER te kunnen aantonen. 95% betrouwbaarheid, 80% power.
 *
 * Gebaseerd op de spreiding die we werkelijk meten, niet op de conversie. Dat
 * scheelt een factor: omdat de meeste bezoekers niets kopen is de
 * standaardafwijking van omzet per bezoeker enorm - in de praktijk ruim drie
 * keer het gemiddelde. Een berekening op conversie geeft daardoor veel te
 * optimistische aantallen, en dan denk je klaar te zijn terwijl je nog naar
 * ruis kijkt.
 *
 * Ter illustratie, bij een winkel met 6,5% conversie en orders rond 37 euro:
 * een verschil van 20% aantonen vraagt ~5.600 bezoekers per groep, 10% vraagt
 * er ~22.500, en 5% ruim 90.000. Kleine prijseffecten zijn duur om te meten.
 */
export function benodigdeBezoekers(
  controle: CohortCijfers,
  minimaalVerschilPct: number,
): number {
  const n = controle.visitors;
  if (n < 2 || minimaalVerschilPct === 0) return 0;

  const gem = controle.revenueCents / n;
  if (gem <= 0) return 0;

  const ruw = controle.revenueSqCents / n - gem * gem;
  const variantie = Math.max(0, ruw) * (n / (n - 1));
  if (variantie <= 0) return 0;

  const verschil = Math.abs(gem * (minimaalVerschilPct / 100));
  if (verschil <= 0) return 0;

  const zAlpha = 1.959964;  // tweezijdig, 5%
  const zBeta = 0.8416212;  // 80% power

  // Twee groepen van gelijke omvang, dus de factor 2.
  return Math.ceil((2 * Math.pow(zAlpha + zBeta, 2) * variantie) / (verschil * verschil));
}

/** p-waarde leesbaar maken. */
export function pTekst(p: number): string {
  if (p < 0.001) return "p < 0,001";
  return "p = " + p.toFixed(3).replace(".", ",");
}

/**
 * Eén zin over wat de uitslag betekent, in gewone taal.
 *
 * Bewust terughoudend: bij een niet-significant verschil zeggen we niet "geen
 * effect" maar "nog niet aan te tonen". Dat is een wezenlijk verschil en de
 * meest gemaakte denkfout bij A/B-tests.
 */
export function uitslagTekst(toets: Toets, genoegBezoekers: boolean): string {
  if (!toets.bruikbaar || !genoegBezoekers) {
    return "Nog te weinig gegevens om iets te kunnen zeggen. Laat de test doorlopen.";
  }
  if (!toets.significant) {
    return (
      "Het verschil is nog niet aan te tonen; het kan toeval zijn. Dat betekent niet dat " +
      "er geen effect is, alleen dat je het met deze aantallen nog niet ziet."
    );
  }
  return toets.lift >= 0
    ? "De testprijs levert aantoonbaar meer op. Het werkelijke verschil ligt vrijwel zeker tussen " +
        toets.onder.toFixed(1).replace(".", ",") + "% en " +
        toets.boven.toFixed(1).replace(".", ",") + "%."
    : "De testprijs levert aantoonbaar minder op. Het werkelijke verschil ligt vrijwel zeker tussen " +
        toets.onder.toFixed(1).replace(".", ",") + "% en " +
        toets.boven.toFixed(1).replace(".", ",") + "%.";
}
