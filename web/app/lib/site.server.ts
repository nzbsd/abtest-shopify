import supabase from "~/db.server";
import { type Filter } from "./siteFilters";

/**
 * De cijfers achter het bezoekersscherm.
 *
 * TWEE BRONNEN, EN DE KEUZE ERTUSSEN IS NIET VRIJBLIJVEND
 * De sessietabel heeft één rij per bezoek met alle dimensies erop, en kan dus
 * alles: filteren, combineren, unieke bezoekers over dagen tellen. Maar hij
 * reikt dertig dagen terug, want hij groeit met het verkeer mee.
 *
 * De dagtotalen reiken oneindig terug maar zijn per dimensie opgeteld. Daarin
 * bestaat "Safari op mobiel" niet meer - alleen "Safari" en "mobiel" apart.
 *
 * Dus: filters of een bereik binnen dertig dagen -> sessies. Anders ->
 * dagtotalen, en dan zegt het scherm erbij dat filteren daar niet kan.
 */

export type SiteBereik = "1" | "7" | "30" | "90";
export type Vergelijking = "vorige" | "jaar";

export type Kern = {
  bezoekers: number;
  nieuwe: number;
  sessies: number;
  pageviews: number;
  bounces: number;
  duurMs: number;
  orders: number;
  omzetCents: number;
  zagCollectie: number;
  zagProduct: number;
  zagCart: number;
  zagCheckout: number;
  /**
   * Toevoegen aan de cart en naar de kassa gaan, uit gedrag en niet uit paden.
   *
   * Op dit thema is geen van beide in de URL te zien: de cart is een drawer en
   * de kassa rendert het thema niet. De oude pad-gebaseerde vlaggen gaven
   * daarom nul van 3.419 sessies - geen steekproef maar een onmogelijkheid.
   */
  deedAtc: number;
  gingCheckout: number;
};

/** Eén rij in een lijstje, met alles wat de metriekwisselaar kan tonen. */
export type Rij = {
  naam: string;
  sessies: number;
  bezoekers: number;
  pageviews: number;
  bounces: number;
  duurMs: number;
  orders: number;
  omzetCents: number;
  /** Sessies in dezelfde periode ervoor, voor de +/- per rij. */
  vorigeSessies: number;
};

export type Punt = { label: string; bezoekers: number; sessies: number; pageviews: number;
                     orders: number; omzetCents: number; vorige: number };

export type PadRij = {
  path: string; pageviews: number; instappen: number; uitstappen: number;
  gemSec: number; gemScroll: number;
  /** Sessies die hier begonnen en niets anders zagen. Tegen instappen, niet
   *  tegen pageviews: bouncen kun je alleen op de pagina waar je binnenkwam. */
  bounces: number;
};

export type SiteData = {
  nu: number;
  /** Sessies per minuut over het laatste half uur, voor het realtime-balkje. */
  realtime: number[];
  kern: Kern;
  vorige: Kern | null;
  punten: Punt[];
  /** Granulariteit van de reeks: uur bij vandaag, anders dag. */
  perUur: boolean;
  paginas: PadRij[];
  instappen: Rij[];
  uitstappen: Rij[];
  bronnen: Rij[];
  utmSource: Rij[];
  utmMedium: Rij[];
  utmCampagne: Rij[];
  landen: Rij[];
  devices: Rij[];
  browsers: Rij[];
  besturing: Rij[];
  nieuwTerug: Rij[];
  routes: { route: string; sessies: number; orders: number }[];
  /** Komt dit uit sessies (filterbaar, dertig dagen) of uit dagtotalen? */
  uitSessies: boolean;
  detailTot: string | null;
  /** Alle landen met bezoek, voor de bol. Niet afgekapt op twaalf zoals de
   *  lijst: een globe met twaalf stippen is een lijst met extra stappen. */
  globe: { land: string; sessies: number; actief: number }[];
  /**
   * Vanaf wanneer cart, kassa en orders gemeten worden.
   *
   * Die drie komen uit het thema-snippet en niet uit de paden, dus voor het
   * moment dat het snippet in het thema stond zijn ze structureel nul. Staat
   * het bereik daar deels vóór, dan is de conversie geen lage conversie maar
   * een gemiddelde over bezoeken die niet konden meetellen.
   */
  signaalVanaf: string | null;
  /** Dezelfde kern, maar alleen over het meetbare deel van het bereik. */
  kernSindsSignaal: Kern | null;
  sessiesVoorSignaal: number;
};

const LEEG: Kern = {
  bezoekers: 0, nieuwe: 0, sessies: 0, pageviews: 0, bounces: 0, duurMs: 0,
  orders: 0, omzetCents: 0, zagCollectie: 0, zagProduct: 0, zagCart: 0, zagCheckout: 0,
  deedAtc: 0, gingCheckout: 0,
};

const dagStart = (dagenTerug: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - dagenTerug);
  return d;
};

function telKernUitDagen(rijen: any[]): Kern {
  const uit = { ...LEEG };
  for (const r of rijen) {
    uit.bezoekers += Number(r.bezoekers) || 0;
    uit.nieuwe += Number(r.nieuwe) || 0;
    uit.sessies += Number(r.sessies) || 0;
    uit.pageviews += Number(r.pageviews) || 0;
    uit.bounces += Number(r.bounces) || 0;
    uit.duurMs += Number(r.duur_ms_som) || 0;
    uit.orders += Number(r.orders) || 0;
    uit.omzetCents += Number(r.omzet_cents) || 0;
    uit.zagCollectie += Number(r.zag_collectie) || 0;
    uit.zagProduct += Number(r.zag_product) || 0;
    uit.zagCart += Number(r.zag_cart) || 0;
    uit.zagCheckout += Number(r.zag_checkout) || 0;
    uit.deedAtc += Number(r.deed_atc) || 0;
    uit.gingCheckout += Number(r.ging_checkout) || 0;
  }
  return uit;
}

/**
 * Alles wat het scherm nodig heeft, in één aanroep.
 *
 * WAAROM DIT NIET MEER IN JAVASCRIPT GEBEURT
 * Dit haalde alle sessierijen op en telde ze hier. PostgREST geeft er maximaal
 * duizend terug - de "Max rows"-instelling - en die grens is stil: geen fout,
 * gewoon duizend rijen. Deze winkel doet er drieduizend per dag.
 *
 * Zonder ORDER BY waren dat de duizend oudste, dus alles wat later op de dag
 * gebeurde viel eruit. Conversie stond op nul omdat de orders van vanochtend
 * acht uur niet in die duizend zaten. Elk getal was om dezelfde reden fout,
 * niet alleen dat ene - het viel alleen bij conversie op, omdat nul opvalt en
 * een plausibel ogend aantal sessies niet.
 *
 * Het dak verhogen was de verkeerde afslag geweest: negentigduizend rijen per
 * keer door een serverless functie duwen om er zes getallen uit te tellen is
 * geen oplossing maar uitstel. Nu telt Postgres en komt er één rij terug.
 */
export async function siteData(
  shop: string,
  bereik: SiteBereik,
  filters: Filter[],
  vergelijking: Vergelijking,
): Promise<SiteData> {
  const dagen = Number(bereik);
  const vanaf = dagStart(dagen - 1);
  // Morgenochtend nul uur: dan valt vandaag er in zijn geheel binnen, welk
  // bereik er ook gekozen is.
  const tot = dagStart(-1);

  /**
   * De vergelijkingsperiode.
   *
   * "vorige" is het venster er direct voor, "jaar" is hetzelfde venster een
   * jaar terug. Dat tweede is voor een winkel vaak eerlijker: december met
   * november vergelijken zegt minder dan december met vorig december.
   *
   * Een jaar terug valt buiten de bewaartermijn van de sessies, dus dan komt
   * de vergelijking uit de dagtotalen. Vandaar dat beide paden bestaan.
   */
  const vorigeVanaf = vergelijking === "jaar"
    ? new Date(Date.UTC(vanaf.getUTCFullYear() - 1, vanaf.getUTCMonth(), vanaf.getUTCDate()))
    : dagStart(dagen * 2 - 1);
  const vorigeTot = vergelijking === "jaar"
    ? new Date(vorigeVanaf.getTime() + dagen * 864e5)
    : vanaf;

  const perUur = dagen === 1;

  // Eén waarde per sleutel, net als in de URL.
  const filterObject: Record<string, string> = {};
  for (const f of filters) filterObject[f.sleutel] = f.waarde;

  /**
   * Vandaag en gisteren opnieuw oprollen.
   *
   * Dit kost honderdtwintig milliseconde en stond vóór de rest te wachten, op
   * elke paginaweergave, terwijl het bij een bereik binnen de bewaartermijn
   * niet eens gelezen wordt - daar komen de cijfers uit de sessies zelf. Nu
   * loopt het mee in dezelfde ronde.
   *
   * Alleen voorbij de dertig dagen worden de dagtotalen wél gelezen, en dan
   * moet het oprollen er eerst doorheen zijn - anders mist vandaag in het
   * antwoord. Dat is precies het geval waarin die honderdtwintig milliseconde
   * ook echt ergens voor is.
   */
  const oprollen = supabase
    .rpc("site_oprollen", { vanaf: dagStart(1).toISOString().slice(0, 10) })
    .then(() => undefined, () => undefined);
  if (dagen > 30) await oprollen;

  const [overzicht, dagRijen, vorigeDagRijen] = await Promise.all([
    supabase.rpc("site_overzicht", {
      p_shop: shop,
      p_vanaf: vanaf.toISOString(),
      p_tot: tot.toISOString(),
      p_vorige_vanaf: vorigeVanaf.toISOString(),
      p_vorige_tot: vorigeTot.toISOString(),
      p_per_uur: perUur,
      p_filters: filterObject,
      p_max: 12,
    }),
    supabase.from("site_dag").select("*").eq("shop", shop)
      .gte("dag", vanaf.toISOString().slice(0, 10)).order("dag"),
    supabase.from("site_dag").select("*").eq("shop", shop)
      .gte("dag", vorigeVanaf.toISOString().slice(0, 10))
      .lt("dag", vorigeTot.toISOString().slice(0, 10)),
  ]).finally(() => oprollen);

  const o = (overzicht.data ?? {}) as any;

  /** snake_case uit Postgres naar de vorm die het scherm leest. */
  const naarKern = (r: any): Kern => ({
    bezoekers: Number(r?.bezoekers) || 0,
    nieuwe: Number(r?.nieuwe) || 0,
    sessies: Number(r?.sessies) || 0,
    pageviews: Number(r?.pageviews) || 0,
    bounces: Number(r?.bounces) || 0,
    duurMs: Number(r?.duur_ms) || 0,
    orders: Number(r?.orders) || 0,
    omzetCents: Number(r?.omzet_cents) || 0,
    zagCollectie: Number(r?.zag_collectie) || 0,
    zagProduct: Number(r?.zag_product) || 0,
    zagCart: Number(r?.zag_cart) || 0,
    zagCheckout: Number(r?.zag_checkout) || 0,
    deedAtc: Number(r?.deed_atc) || 0,
    gingCheckout: Number(r?.ging_checkout) || 0,
  });

  /**
   * Voorbij de bewaartermijn is er geen sessiedetail meer, alleen dagtotalen.
   * Filteren kan daar niet op, dus dat pad geldt alleen ongefilterd.
   */
  const uitSessies = filters.length > 0 || dagen <= 30 || !(dagRijen.data ?? []).length;
  const kern = uitSessies ? naarKern(o.kern) : telKernUitDagen(dagRijen.data ?? []);
  const vorige = uitSessies
    ? (o.vorige ? naarKern(o.vorige) : null)
    : ((vorigeDagRijen.data ?? []).length ? telKernUitDagen(vorigeDagRijen.data ?? []) : null);

  /* ── tijdreeks ──────────────────────────────────────────────────────────
   * Welke bakken er moeten zijn bepaalt het scherm, niet de data: een uur
   * zonder bezoek is een gat in de grafiek en geen ontbrekende balk. Wat er
   * in die bakken zit komt uit de query.
   * ────────────────────────────────────────────────────────────────────── */
  const bakken = (o.puntenNu ?? {}) as Record<string, any>;
  const vorigeReeks = (o.puntenToen ?? []) as number[];
  const sleutels = perUur
    ? Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0") + ":00")
    : Array.from({ length: dagen }, (_, i) =>
        dagStart(dagen - 1 - i).toISOString().slice(0, 10));

  const punten: Punt[] = sleutels.map((k, i) => {
    const h = bakken[k];
    return {
      label: k,
      bezoekers: Number(h?.bezoekers) || 0,
      sessies: Number(h?.sessies) || 0,
      pageviews: Number(h?.pageviews) || 0,
      orders: Number(h?.orders) || 0,
      omzetCents: Number(h?.omzetCents) || 0,
      // De vergelijkingsreeks op positie, niet op datum: anders valt hij
      // naast de huidige in plaats van eronder.
      vorige: Number(vorigeReeks[i]) || 0,
    };
  });

  const lijst = (dim: string): Rij[] =>
    (((o.lijsten ?? {})[dim] ?? []) as any[]).map((r) => ({
      naam: String(r.naam),
      sessies: Number(r.sessies) || 0,
      bezoekers: Number(r.bezoekers) || 0,
      pageviews: Number(r.pageviews) || 0,
      bounces: Number(r.bounces) || 0,
      duurMs: Number(r.duurMs) || 0,
      orders: Number(r.orders) || 0,
      omzetCents: Number(r.omzetCents) || 0,
      vorigeSessies: Number(r.vorigeSessies) || 0,
    }));

  const paginas: PadRij[] = ((o.paginas ?? []) as any[]).map((r) => ({
    path: String(r.path),
    pageviews: Number(r.pageviews) || 0,
    instappen: Number(r.instappen) || 0,
    uitstappen: Number(r.uitstappen) || 0,
    bounces: Number(r.bounces) || 0,
    gemSec: Number(r.gemSec) || 0,
    gemScroll: Number(r.gemScroll) || 0,
  }));

  /**
   * Vanaf wanneer cart, kassa en orders meetellen.
   *
   * Die drie komen uit het thema-snippet en niet uit de paden, dus voor het
   * moment dat het snippet in het thema stond zijn ze structureel nul. Alleen
   * melden als het bereik daar écht voor begint - anders staat er elke dag een
   * waarschuwing over niets.
   */
  const signaal = o.signaalVanaf ? String(o.signaalVanaf) : null;
  const meldSignaal = signaal !== null
    && Number(o.voorSignaal) > 0
    && new Date(signaal) > vanaf;

  return {
    nu: Number(o.nu) || 0,
    realtime: ((o.realtime ?? []) as any[]).map((n) => Number(n) || 0),
    kern,
    vorige,
    punten,
    perUur,
    paginas,
    instappen: lijst("instap"),
    uitstappen: lijst("uitstap"),
    bronnen: lijst("bron"),
    utmSource: lijst("utm_source"),
    utmMedium: lijst("utm_medium"),
    utmCampagne: lijst("utm_campaign"),
    landen: lijst("country"),
    devices: lijst("device"),
    browsers: lijst("browser"),
    besturing: lijst("os"),
    nieuwTerug: lijst("nieuw"),
    routes: ((o.routes ?? []) as any[]).map((r) => ({
      route: String(r.route),
      sessies: Number(r.sessies) || 0,
      orders: Number(r.orders) || 0,
    })),
    uitSessies,
    globe: ((o.globe ?? []) as any[]).map((r) => ({
      land: String(r.land),
      sessies: Number(r.sessies) || 0,
      actief: Number(r.actief) || 0,
    })),
    detailTot: o.detailTot ? String(o.detailTot) : null,
    signaalVanaf: meldSignaal ? signaal : null,
    kernSindsSignaal: meldSignaal ? naarKern(o.kernSinds) : null,
    sessiesVoorSignaal: meldSignaal ? Number(o.voorSignaal) || 0 : 0,
  };
}
