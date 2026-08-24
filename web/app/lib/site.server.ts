import supabase from "~/db.server";
import { past, type Filter } from "./siteFilters";

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
};

const LEEG: Kern = {
  bezoekers: 0, nieuwe: 0, sessies: 0, pageviews: 0, bounces: 0, duurMs: 0,
  orders: 0, omzetCents: 0, zagCollectie: 0, zagProduct: 0, zagCart: 0, zagCheckout: 0,
  deedAtc: 0, gingCheckout: 0,
};

const leegRij = (naam: string): Rij => ({
  naam, sessies: 0, bezoekers: 0, pageviews: 0, bounces: 0, duurMs: 0,
  orders: 0, omzetCents: 0, vorigeSessies: 0,
});

const dagStart = (dagenTerug: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - dagenTerug);
  return d;
};

function telKern(rijen: any[]): Kern {
  const uit = { ...LEEG };
  const bez = new Set<string>();
  for (const r of rijen) {
    bez.add(String(r.visitor_id));
    uit.sessies += 1;
    uit.pageviews += Number(r.pageviews) || 0;
    if ((Number(r.pageviews) || 0) <= 1) uit.bounces += 1;
    uit.duurMs += Number(r.duur_ms) || 0;
    uit.orders += Number(r.orders) || 0;
    uit.omzetCents += Number(r.omzet_cents) || 0;
    if (r.nieuw) uit.nieuwe += 1;
    if (r.zag_collectie) uit.zagCollectie += 1;
    if (r.zag_product) uit.zagProduct += 1;
    if (r.zag_cart) uit.zagCart += 1;
    if (r.zag_checkout) uit.zagCheckout += 1;
    if (r.deed_atc) uit.deedAtc += 1;
    if (r.ging_checkout) uit.gingCheckout += 1;
  }
  uit.bezoekers = bez.size;
  return uit;
}

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
 * Sessies groeperen op een dimensie.
 *
 * Elke rij draagt alle metrieken mee, niet alleen het aantal. Dat is wat de
 * metriekwisselaar mogelijk maakt: van "sessies" naar "bounce rate" of
 * "conversie" wisselen is dan een andere kolom lezen en niet een nieuwe query.
 */
function groepeer(
  rijen: any[],
  vorigeRijen: any[],
  sleutel: (r: any) => string | null,
  max = 12,
): Rij[] {
  const m = new Map<string, Rij>();
  const bez = new Map<string, Set<string>>();

  for (const r of rijen) {
    const k = sleutel(r);
    if (k === null || k === "") continue;
    const h = m.get(k) ?? leegRij(k);
    h.sessies += 1;
    h.pageviews += Number(r.pageviews) || 0;
    if ((Number(r.pageviews) || 0) <= 1) h.bounces += 1;
    h.duurMs += Number(r.duur_ms) || 0;
    h.orders += Number(r.orders) || 0;
    h.omzetCents += Number(r.omzet_cents) || 0;
    m.set(k, h);

    const s = bez.get(k) ?? new Set<string>();
    s.add(String(r.visitor_id));
    bez.set(k, s);
  }

  for (const r of vorigeRijen) {
    const k = sleutel(r);
    if (k === null || k === "") continue;
    const h = m.get(k);
    if (h) h.vorigeSessies += 1;
  }

  for (const [k, h] of m) h.bezoekers = bez.get(k)?.size ?? 0;

  return Array.from(m.values()).sort((a, b) => b.sessies - a.sessies).slice(0, max);
}

export async function siteData(
  shop: string,
  bereik: SiteBereik,
  filters: Filter[],
  vergelijking: Vergelijking,
): Promise<SiteData> {
  const dagen = Number(bereik);
  const vanaf = dagStart(dagen - 1);

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

  // Vandaag en gisteren opnieuw oprollen: de nachtelijke taak is het vangnet,
  // niet de bron. Mag falen zonder het scherm mee te nemen.
  await supabase.rpc("site_oprollen", { vanaf: dagStart(1).toISOString().slice(0, 10) })
    .then(() => undefined, () => undefined);

  const halfuur = new Date(Date.now() - 30 * 60_000).toISOString();

  const [sessies, vorigeSessies, dagRijen, vorigeDagRijen, recent] = await Promise.all([
    supabase.from("site_sessies").select("*").eq("shop", shop)
      .gte("begonnen", vanaf.toISOString()).limit(50000),
    supabase.from("site_sessies").select("*").eq("shop", shop)
      .gte("begonnen", vorigeVanaf.toISOString()).lt("begonnen", vorigeTot.toISOString())
      .limit(50000),
    supabase.from("site_dag").select("*").eq("shop", shop)
      .gte("dag", vanaf.toISOString().slice(0, 10)).order("dag"),
    supabase.from("site_dag").select("*").eq("shop", shop)
      .gte("dag", vorigeVanaf.toISOString().slice(0, 10))
      .lt("dag", vorigeTot.toISOString().slice(0, 10)),
    supabase.from("site_sessies").select("laatst").eq("shop", shop)
      .gte("laatst", halfuur).limit(5000),
  ]);

  const alle = sessies.data ?? [];
  const s = filters.length ? alle.filter((r) => past(r, filters)) : alle;
  const v = filters.length
    ? (vorigeSessies.data ?? []).filter((r) => past(r, filters))
    : (vorigeSessies.data ?? []);

  /**
   * Komt het uit sessies of uit dagtotalen?
   *
   * Sessies zodra er gefilterd wordt - dan kán het niet anders. Anders zodra
   * het bereik binnen de bewaartermijn valt, want daar zijn ze preciezer:
   * unieke bezoekers over meerdere dagen kun je uit dagtotalen niet halen
   * zonder dezelfde persoon dubbel te tellen.
   */
  const uitSessies = filters.length > 0 || dagen <= 30 || alle.length > 0;
  const kern = uitSessies ? telKern(s) : telKernUitDagen(dagRijen.data ?? []);
  const vorige = uitSessies
    ? (v.length ? telKern(v) : null)
    : ((vorigeDagRijen.data ?? []).length ? telKernUitDagen(vorigeDagRijen.data ?? []) : null);

  /* ── tijdreeks ──────────────────────────────────────────────────────────
   * Bij "vandaag" per uur, anders per dag. Een dagbalk voor vandaag is één
   * balk, en dat vertelt niets over of het een rustige ochtend was.
   * ────────────────────────────────────────────────────────────────────── */
  const perUur = dagen === 1;
  const punten: Punt[] = (() => {
    const sleutelVan = (iso: string) =>
      perUur ? String(iso).slice(11, 13) + ":00" : String(iso).slice(0, 10);

    const bak = new Map<string, { bez: Set<string>; ses: number; pv: number; ord: number; omzet: number }>();
    const vorigeBak = new Map<string, number>();

    const zet = (map: typeof bak, r: any) => {
      const k = sleutelVan(r.begonnen);
      const h = map.get(k) ?? { bez: new Set<string>(), ses: 0, pv: 0, ord: 0, omzet: 0 };
      h.bez.add(String(r.visitor_id));
      h.ses += 1;
      h.pv += Number(r.pageviews) || 0;
      h.ord += Number(r.orders) || 0;
      h.omzet += Number(r.omzet_cents) || 0;
      map.set(k, h);
    };

    for (const r of s) zet(bak, r);

    // De vergelijkingsreeks op positie leggen, niet op datum: anders valt hij
    // naast de huidige in plaats van eronder.
    const vSorted = [...v].sort((a, b) => String(a.begonnen).localeCompare(String(b.begonnen)));
    const vBakken = new Map<string, number>();
    for (const r of vSorted) {
      const k = sleutelVan(r.begonnen);
      vBakken.set(k, (vBakken.get(k) ?? 0) + 1);
    }
    const vLijst = Array.from(vBakken.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    const sleutels = perUur
      ? Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0") + ":00")
      : Array.from({ length: dagen }, (_, i) =>
          dagStart(dagen - 1 - i).toISOString().slice(0, 10));

    return sleutels.map((k, i) => {
      const h = bak.get(k);
      return {
        label: k,
        bezoekers: h?.bez.size ?? 0,
        sessies: h?.ses ?? 0,
        pageviews: h?.pv ?? 0,
        orders: h?.ord ?? 0,
        omzetCents: h?.omzet ?? 0,
        vorige: vLijst[i]?.[1] ?? 0,
      };
    });
  })();

  /* ── realtime ───────────────────────────────────────────────────────── */
  const realtime = (() => {
    const bakken = new Array(30).fill(0);
    const nu = Date.now();
    for (const r of recent.data ?? []) {
      const min = Math.floor((nu - new Date(String(r.laatst)).getTime()) / 60000);
      if (min >= 0 && min < 30) bakken[29 - min] += 1;
    }
    return bakken;
  })();

  /* ── pagina's ───────────────────────────────────────────────────────── */
  const paginas: PadRij[] = (() => {
    const m = new Map<string, { pv: number; in: number; uit: number; duur: number; scroll: number; n: number; bounce: number }>();
    const bij = (p: string) => m.get(p) ?? { pv: 0, in: 0, uit: 0, duur: 0, scroll: 0, n: 0, bounce: 0 };
    for (const r of s) {
      for (const p of (r.paden ?? []) as string[]) {
        const h = bij(p); h.pv += 1; m.set(p, h);
      }
      if (r.instap) {
        const h = bij(r.instap);
        h.in += 1;
        if ((Number(r.pageviews) || 0) <= 1) h.bounce += 1;
        m.set(r.instap, h);
      }
      if (r.uitstap) {
        const h = bij(r.uitstap);
        h.uit += 1;
        h.duur += Number(r.duur_ms) || 0;
        h.scroll += Number(r.max_scroll) || 0;
        h.n += 1;
        m.set(r.uitstap, h);
      }
    }
    return Array.from(m.entries())
      .map(([path, h]) => ({
        path, pageviews: h.pv, instappen: h.in, uitstappen: h.uit, bounces: h.bounce,
        gemSec: h.n ? Math.round(h.duur / 1000 / h.n) : 0,
        gemScroll: h.n ? Math.round(h.scroll / h.n) : 0,
      }))
      .sort((a, b) => b.pageviews - a.pageviews)
      .slice(0, 30);
  })();

  /* ── routes ─────────────────────────────────────────────────────────────
   * De meest gelopen volgordes. Afgekapt op vier stappen: langer wordt elke
   * route uniek en dan telt alles één keer, wat niets zegt.
   * ────────────────────────────────────────────────────────────────────── */
  const routes = (() => {
    const m = new Map<string, { n: number; orders: number }>();
    for (const r of s) {
      const paden = (r.paden ?? []) as string[];
      if (paden.length < 2) continue;
      const route = paden.slice(0, 4).join(" → ") + (paden.length > 4 ? " → …" : "");
      const h = m.get(route) ?? { n: 0, orders: 0 };
      h.n += 1;
      h.orders += Number(r.orders) || 0;
      m.set(route, h);
    }
    return Array.from(m.entries())
      .map(([route, h]) => ({ route, sessies: h.n, orders: h.orders }))
      .sort((a, b) => b.sessies - a.sessies)
      .slice(0, 10);
  })();

  const g = (sleutel: (r: any) => string | null, max = 12) => groepeer(s, v, sleutel, max);

  return {
    nu: new Set((recent.data ?? []).map((r: any) => String(r.laatst))).size
      ? (recent.data ?? []).filter((r: any) =>
          Date.now() - new Date(String(r.laatst)).getTime() < 5 * 60_000).length
      : 0,
    realtime,
    kern,
    vorige,
    punten,
    perUur,
    paginas,
    instappen: g((r) => r.instap || null),
    uitstappen: g((r) => r.uitstap || null),
    bronnen: g((r) => r.utm_source || r.verwijzer || "direct"),
    utmSource: g((r) => r.utm_source || null),
    utmMedium: g((r) => r.utm_medium || null),
    utmCampagne: g((r) => r.utm_campaign || null),
    landen: g((r) => r.country || "??"),
    devices: g((r) => r.device || "unknown"),
    browsers: g((r) => r.browser || "unknown"),
    besturing: g((r) => r.os || "unknown"),
    nieuwTerug: g((r) => (r.nieuw ? "new" : "returning"), 2),
    routes,
    uitSessies,
    detailTot: alle.length
      ? alle.reduce((a: string, r: any) =>
          String(r.begonnen) < a ? String(r.begonnen) : a, String(alle[0].begonnen)).slice(0, 10)
      : null,
  };
}
