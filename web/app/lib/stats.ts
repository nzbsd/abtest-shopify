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

/**
 * Tweezijdige p-waarde bij een z- of t-waarde.
 *
 * Afgekapt op [0,1]: de benadering hierboven heeft een fout van ~1e-9, en bij
 * z = 0 komt daar 1,0000000010 uit. Wiskundig onzin en op het scherm lelijk,
 * dus hier vastgezet in plaats van bij elke lezer.
 */
function tweezijdigeP(z: number): number {
  return Math.min(1, Math.max(0, 2 * (1 - normaleCdf(Math.abs(z)))));
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

/**
 * Kritieke z-waarde per betrouwbaarheidsniveau.
 *
 * 95% is de gewoonte, maar het is een keuze en geen natuurwet. Wie snel wil
 * bijsturen op iets goedkoops kan met 90% uit de voeten; wie een prijs voor
 * de hele winkel omzet wil 99%. Het niveau bepaalt zowel de breedte van het
 * interval als waar de grens voor "significant" ligt, dus het moet één
 * instelling zijn en niet twee.
 */
const Z: Record<number, number> = { 90: 1.644854, 95: 1.959964, 99: 2.575829 };

export const zVan = (betrouwbaarheid = 95) => Z[betrouwbaarheid] ?? Z[95];
export const alfaVan = (betrouwbaarheid = 95) => 1 - (betrouwbaarheid ?? 95) / 100;

const Z95 = Z[95];

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
export function toetsOmzetPerBezoeker(c: CohortCijfers, t: CohortCijfers, betrouwbaarheid = 95): Toets {
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
  const marge = zVan(betrouwbaarheid) * se;
  const basis = a.gem || 1;

  return {
    lift: (verschil / basis) * 100,
    onder: ((verschil - marge) / basis) * 100,
    boven: ((verschil + marge) / basis) * 100,
    p,
    significant: p < alfaVan(betrouwbaarheid),
    bruikbaar: true,
  };
}

/**
 * Twee gemiddelden vergelijken, gegeven som en som-van-kwadraten.
 *
 * Losgetrokken uit toetsOmzetPerBezoeker omdat gemiddelde orderwaarde precies
 * dezelfde wiskunde is met een andere noemer: daar tel je per bezoeker, hier
 * per order. Het verschil is niet cosmetisch - bij orderwaarde tellen de
 * niet-kopers niet mee, en dat is een veel kleinere en veel minder scheve
 * steekproef.
 */
export function toetsGemiddelde(
  a: { som: number; somKwadraten: number; n: number },
  b: { som: number; somKwadraten: number; n: number },
  betrouwbaarheid = 95,
): Toets {
  const stat = (g: { som: number; somKwadraten: number; n: number }) => {
    if (g.n < 2) return { n: g.n, gem: 0, var: 0 };
    const gem = g.som / g.n;
    const ruw = g.somKwadraten / g.n - gem * gem;
    return { n: g.n, gem, var: Math.max(0, ruw) * (g.n / (g.n - 1)) };
  };

  const x = stat(a);
  const y = stat(b);
  // Twintig orders per groep is weinig, maar orderwaarde is veel minder scheef
  // verdeeld dan omzet per bezoeker, dus de drempel mag lager dan de dertig
  // die daar geldt.
  const bruikbaar = x.n >= 20 && y.n >= 20 && (x.var > 0 || y.var > 0);

  if (!bruikbaar) {
    const lift = x.gem > 0 ? ((y.gem - x.gem) / x.gem) * 100 : 0;
    return { lift, onder: 0, boven: 0, p: 1, significant: false, bruikbaar: false };
  }

  const se = Math.sqrt(x.var / x.n + y.var / y.n);
  const verschil = y.gem - x.gem;
  const p = se > 0 ? tweezijdigeP(verschil / se) : 1;
  const marge = zVan(betrouwbaarheid) * se;
  const basis = x.gem || 1;

  return {
    lift: (verschil / basis) * 100,
    onder: ((verschil - marge) / basis) * 100,
    boven: ((verschil + marge) / basis) * 100,
    p,
    significant: p < alfaVan(betrouwbaarheid),
    bruikbaar: true,
  };
}

/**
 * Sample Ratio Mismatch: klopt de verdeling met wat je hebt ingesteld?
 *
 * Dit is de belangrijkste controle in de hele app en hij staat er los van de
 * uitslag, omdat hij iets anders zegt. Stel je 50/50 in en zie je 55/45 bij
 * duizenden bezoekers, dan is de kans dat dat toeval is verwaarloosbaar - en
 * dan is er iets stuk aan de toewijzing, niet iets interessants aan de variant.
 *
 * Wat het meestal betekent: de doorverwijzing faalt voor een deel van de
 * testgroep, een bot telt maar aan één kant mee, een cache serveert één versie,
 * of de meting mist events aan één kant. In al die gevallen is de vergelijking
 * scheef en zegt de uitslag niets - hoe mooi de p-waarde ook is.
 *
 * Chi-kwadraat met één vrijheidsgraad. De drempel ligt bewust streng op 0,001:
 * bij ruime aantallen tikt deze toets aan op verschillen die er niet toe doen,
 * en een vals alarm dat je leert negeren is erger dan geen alarm.
 */
export type SrmUitslag = {
  verwachtTest: number;
  werkelijkTest: number;
  totaal: number;
  chi: number;
  p: number;
  /** Scheef genoeg om de uitslag niet te vertrouwen. */
  scheef: boolean;
  /** Genoeg waarnemingen om er iets over te zeggen. */
  bruikbaar: boolean;
};

export function toetsVerdeling(
  bezoekersControle: number,
  bezoekersTest: number,
  splitPct: number,
): SrmUitslag {
  const totaal = bezoekersControle + bezoekersTest;
  const deelTest = (splitPct || 50) / 100;
  const verwachtTest = totaal * deelTest;
  const verwachtControle = totaal * (1 - deelTest);

  // Onder de vijfhonderd zegt deze toets zo weinig dat elk antwoord misleidt.
  const bruikbaar = totaal >= 500 && verwachtTest > 0 && verwachtControle > 0;
  if (!bruikbaar) {
    return { verwachtTest, werkelijkTest: bezoekersTest, totaal, chi: 0, p: 1, scheef: false, bruikbaar: false };
  }

  const chi =
    Math.pow(bezoekersTest - verwachtTest, 2) / verwachtTest +
    Math.pow(bezoekersControle - verwachtControle, 2) / verwachtControle;

  // Met één vrijheidsgraad is de p-waarde van chi-kwadraat gelijk aan de
  // tweezijdige p van de wortel, gelezen op de normale verdeling.
  const p = tweezijdigeP(Math.sqrt(chi));

  return { verwachtTest, werkelijkTest: bezoekersTest, totaal, chi, p, scheef: p < 0.001, bruikbaar: true };
}

/** Conversie, getoetst op twee proporties. */
export function toetsConversie(c: CohortCijfers, t: CohortCijfers, betrouwbaarheid = 95): Toets {
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
  const marge = zVan(betrouwbaarheid) * se;
  const basis = pa || 1;

  return {
    lift: ((pb - pa) / basis) * 100,
    onder: ((pb - pa - marge) / basis) * 100,
    boven: ((pb - pa + marge) / basis) * 100,
    p,
    significant: p < alfaVan(betrouwbaarheid),
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

/**
 * Steekproefomvang voor een gemiddelde, uit de spreiding die je al meet.
 *
 * Werkt voor omzet per bezoeker (n = bezoekers) en voor orderwaarde
 * (n = orders). Die twee door elkaar halen is geen detail: bij een test met
 * 900 bezoekers en 250 orders levert dat een voortgang van 1% of van 40% op,
 * afhankelijk van welke noemer je pakt, en beide zien er even plausibel uit.
 */
export function benodigdVoorGemiddelde(
  controle: { som: number; somKwadraten: number; n: number },
  minimaalVerschilPct: number,
  betrouwbaarheid = 95,
  power = 80,
): number {
  const { som, somKwadraten, n } = controle;
  if (n < 2 || !minimaalVerschilPct) return 0;

  const gem = som / n;
  if (gem <= 0) return 0;

  const ruw = somKwadraten / n - gem * gem;
  const variantie = Math.max(0, ruw) * (n / (n - 1));
  if (variantie <= 0) return 0;

  const verschil = Math.abs(gem * (minimaalVerschilPct / 100));
  if (verschil <= 0) return 0;

  const zAlpha = zVan(betrouwbaarheid);
  const zBeta = power >= 90 ? 1.281552 : 0.8416212;

  // Twee groepen van gelijke omvang, vandaar de factor 2.
  return Math.ceil((2 * Math.pow(zAlpha + zBeta, 2) * variantie) / (verschil * verschil));
}

/**
 * Steekproefomvang voor een verhouding (conversie, add-to-cart, aandeel).
 *
 * Waarom apart van de omzetvariant: bij een verhouding volgt de spreiding uit
 * de verhouding zelf, dus je hebt geen gemeten variantie nodig en kun je dit
 * al uitrekenen vóórdat de test één bezoeker heeft gezien. Dat is precies wat
 * je wilt weten op het moment dat je hem opzet.
 *
 * Van 2% naar 2,2% tillen vraagt iets heel anders dan van 20% naar 22%: bij
 * lage percentages is de relatieve ruis veel groter. Vandaar de basis als
 * argument in plaats van een vuistregel.
 */
export function benodigdVoorVerhouding(
  basisFractie: number,
  minimaalVerschilPct: number,
  betrouwbaarheid = 95,
  power = 80,
): number {
  const p1 = basisFractie;
  const p2 = p1 * (1 + minimaalVerschilPct / 100);
  if (p1 <= 0 || p1 >= 1 || p2 <= 0 || p2 >= 1 || minimaalVerschilPct === 0) return 0;

  const zAlpha = zVan(betrouwbaarheid);
  const zBeta = power >= 90 ? 1.281552 : 0.8416212;
  const verschil = Math.abs(p2 - p1);

  const gem = (p1 + p2) / 2;
  const teller =
    zAlpha * Math.sqrt(2 * gem * (1 - gem)) + zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2));
  return Math.ceil(Math.pow(teller, 2) / (verschil * verschil));
}

/**
 * Hoe lang de test nog moet, gegeven wat er per dag binnenkomt.
 *
 * Null als er niets te zeggen valt. Bewust geen schatting uit één dag verkeer:
 * een weekend ziet er anders uit dan een dinsdag, dus onder de twee dagen
 * historie geven we liever geen antwoord dan een antwoord dat er stellig
 * uitziet.
 */
export function dagenTeGaan(
  benodigdPerGroep: number,
  huidigMinimum: number,
  perDagPerGroep: number,
  dagenGelopen: number,
): number | null {
  if (!benodigdPerGroep || dagenGelopen < 2 || perDagPerGroep <= 0) return null;
  const tekort = benodigdPerGroep - huidigMinimum;
  if (tekort <= 0) return 0;
  return Math.ceil(tekort / perDagPerGroep);
}

/** p-waarde leesbaar maken. */
export function pTekst(p: number): string {
  if (p < 0.001) return "p < 0.001";
  return "p = " + p.toFixed(3);
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
    return "Not enough data to say anything yet. Let the test keep running.";
  }
  if (!toets.significant) {
    return (
      "The difference is not solid yet; it could be chance. That does not mean there is no " +
      "effect, only that these numbers cannot show it."
    );
  }
  const range = toets.onder.toFixed(1) + "% and " + toets.boven.toFixed(1) + "%";
  return toets.lift >= 0
    ? "The test price earns measurably more. The real difference is almost certainly between " + range + "."
    : "The test price earns measurably less. The real difference is almost certainly between " + range + ".";
}

/**
 * Twee aandelen vergelijken, bijvoorbeeld het abonnementsaandeel van de orders.
 *
 * Zelfde wiskunde als toetsConversie maar met een vrij te kiezen noemer: daar
 * is de noemer het aantal bezoekers, hier het aantal orders. Losse functie in
 * plaats van een parameter erbij, omdat de twee verschillende drempels nodig
 * hebben - bij orders zijn er altijd veel minder waarnemingen.
 */
export function toetsAandeel(
  aTeller: number, aNoemer: number,
  bTeller: number, bNoemer: number,
  betrouwbaarheid = 95,
): Toets {
  const pa = aNoemer ? aTeller / aNoemer : 0;
  const pb = bNoemer ? bTeller / bNoemer : 0;

  const bruikbaar = aNoemer >= 20 && bNoemer >= 20 && aTeller + bTeller >= 5;
  if (!bruikbaar) {
    return { lift: pa > 0 ? ((pb - pa) / pa) * 100 : 0, onder: 0, boven: 0, p: 1, significant: false, bruikbaar: false };
  }

  const pool = (aTeller + bTeller) / (aNoemer + bNoemer);
  const sePool = Math.sqrt(pool * (1 - pool) * (1 / aNoemer + 1 / bNoemer));
  const p = sePool > 0 ? tweezijdigeP((pb - pa) / sePool) : 1;

  const se = Math.sqrt((pa * (1 - pa)) / aNoemer + (pb * (1 - pb)) / bNoemer);
  const marge = zVan(betrouwbaarheid) * se;
  const basis = pa || 1;

  return {
    lift: ((pb - pa) / basis) * 100,
    onder: ((pb - pa - marge) / basis) * 100,
    boven: ((pb - pa + marge) / basis) * 100,
    p,
    significant: p < alfaVan(betrouwbaarheid),
    bruikbaar: true,
  };
}
