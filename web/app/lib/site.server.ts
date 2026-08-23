import supabase from "~/db.server";

/**
 * De cijfers achter het bezoekersscherm.
 *
 * WAAROM UIT TWEE BRONNEN
 * Recente dagen komen uit de sessietabel, oudere uit de dagtotalen. Dat is
 * geen optimalisatie maar noodzaak: de sessietabel wordt na zestig dagen
 * opgeruimd omdat hij met het verkeer meegroeit, terwijl de dagtotalen een
 * paar honderd bytes per dag zijn en dus blijven staan.
 *
 * Voor het gekozen bereik wordt daarom eerst gekeken of het volledig binnen
 * de sessietabel valt. Zo ja, dan komt alles daaruit - inclusief details die
 * in de dagtotalen niet meer bestaan, zoals de route door de winkel.
 */

export type SiteBereik = "1" | "7" | "30" | "90";

export type SiteKerncijfers = {
  bezoekers: number;
  nieuweBezoekers: number;
  sessies: number;
  pageviews: number;
  bounces: number;
  duurMs: number;
  /** Trechter: hoeveel sessies elke stap haalden. */
  zagCollectie: number;
  zagProduct: number;
  zagCart: number;
  zagCheckout: number;
};

export type SiteRij = { naam: string; aantal: number; extra?: number };

export type SiteData = {
  nu: number;
  kern: SiteKerncijfers;
  vorige: SiteKerncijfers | null;
  perDag: { dag: string; bezoekers: number; sessies: number; pageviews: number }[];
  paginas: { path: string; pageviews: number; instappen: number; uitstappen: number; gemSec: number }[];
  bronnen: SiteRij[];
  landen: SiteRij[];
  devices: SiteRij[];
  browsers: SiteRij[];
  besturing: SiteRij[];
  talen: SiteRij[];
  schermen: SiteRij[];
  /** Hoeveel sessies er in de tabel zitten - zegt of de details compleet zijn. */
  detailTot: string | null;
};

const LEEG: SiteKerncijfers = {
  bezoekers: 0, nieuweBezoekers: 0, sessies: 0, pageviews: 0, bounces: 0, duurMs: 0,
  zagCollectie: 0, zagProduct: 0, zagCart: 0, zagCheckout: 0,
};

const dagenGeleden = (n: number) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
};

/** Telt sessies op tot kerncijfers. */
function telSessies(rijen: any[]): SiteKerncijfers {
  const uit = { ...LEEG };
  const bezoekers = new Set<string>();
  for (const r of rijen) {
    bezoekers.add(String(r.visitor_id));
    uit.sessies += 1;
    uit.pageviews += Number(r.pageviews) || 0;
    if ((Number(r.pageviews) || 0) <= 1) uit.bounces += 1;
    uit.duurMs += Number(r.duur_ms) || 0;
    if (r.nieuw) uit.nieuweBezoekers += 1;
    if (r.zag_collectie) uit.zagCollectie += 1;
    if (r.zag_product) uit.zagProduct += 1;
    if (r.zag_cart) uit.zagCart += 1;
    if (r.zag_checkout) uit.zagCheckout += 1;
  }
  uit.bezoekers = bezoekers.size;
  return uit;
}

/** Telt dagtotalen op tot kerncijfers. */
function telDagen(rijen: any[]): SiteKerncijfers {
  const uit = { ...LEEG };
  for (const r of rijen) {
    // Bezoekers per dag zijn niet optelbaar over dagen - dezelfde persoon kan
    // op twee dagen terugkomen. Dit is dus een bovengrens, en het scherm noemt
    // hem daarom "visits" zodra het bereik uit dagtotalen komt.
    uit.bezoekers += Number(r.bezoekers) || 0;
    uit.nieuweBezoekers += Number(r.nieuwe) || 0;
    uit.sessies += Number(r.sessies) || 0;
    uit.pageviews += Number(r.pageviews) || 0;
    uit.bounces += Number(r.bounces) || 0;
    uit.duurMs += Number(r.duur_ms_som) || 0;
    uit.zagCollectie += Number(r.zag_collectie) || 0;
    uit.zagProduct += Number(r.zag_product) || 0;
    uit.zagCart += Number(r.zag_cart) || 0;
    uit.zagCheckout += Number(r.zag_checkout) || 0;
  }
  return uit;
}

export async function siteData(shop: string, bereik: SiteBereik): Promise<SiteData> {
  const dagen = Number(bereik);
  const vanaf = dagenGeleden(dagen - 1);
  const vorigeVanaf = dagenGeleden(dagen * 2 - 1);

  /**
   * Vandaag en gisteren opnieuw oprollen bij het laden.
   *
   * De nachtelijke taak is het vangnet, niet de bron: wie 's middags kijkt wil
   * niet naar cijfers van vannacht staren. Oprollen is idempotent en raakt
   * alleen deze twee dagen, dus het is goedkoop genoeg om elke keer te doen.
   *
   * Mag falen zonder het scherm mee te nemen - dan zie je de dagtotalen van
   * de laatste nachtelijke ronde, en het scherm vult vandaag alsnog aan uit
   * de sessietabel zelf.
   */
  await supabase.rpc("site_oprollen", { vanaf: dagenGeleden(1).toISOString().slice(0, 10) })
    .then(() => undefined, () => undefined);

  const [sessies, vorigeSessies, dagRijen, padRijen, bronRijen, geoRijen, techRijen, nuRij, oudste] =
    await Promise.all([
      supabase.from("site_sessies").select("*").eq("shop", shop)
        .gte("begonnen", vanaf.toISOString()).limit(50000),
      supabase.from("site_sessies").select("pageviews, duur_ms, visitor_id, nieuw, zag_collectie, zag_product, zag_cart, zag_checkout")
        .eq("shop", shop)
        .gte("begonnen", vorigeVanaf.toISOString()).lt("begonnen", vanaf.toISOString()).limit(50000),
      supabase.from("site_dag").select("*").eq("shop", shop)
        .gte("dag", vanaf.toISOString().slice(0, 10)).order("dag"),
      supabase.from("site_dag_pad").select("*").eq("shop", shop)
        .gte("dag", vanaf.toISOString().slice(0, 10)),
      supabase.from("site_dag_bron").select("*").eq("shop", shop)
        .gte("dag", vanaf.toISOString().slice(0, 10)),
      supabase.from("site_dag_geo").select("*").eq("shop", shop)
        .gte("dag", vanaf.toISOString().slice(0, 10)),
      supabase.from("site_dag_tech").select("*").eq("shop", shop)
        .gte("dag", vanaf.toISOString().slice(0, 10)),
      // Nu online: sessies met activiteit in de laatste vijf minuten.
      supabase.from("site_sessies").select("session_id", { count: "exact", head: true })
        .eq("shop", shop).gte("laatst", new Date(Date.now() - 5 * 60_000).toISOString()),
      supabase.from("site_sessies").select("begonnen").eq("shop", shop)
        .order("begonnen").limit(1).maybeSingle(),
    ]);

  const s = sessies.data ?? [];

  /**
   * Kerncijfers uit de sessies wanneer die het hele bereik dekken, anders uit
   * de dagtotalen. De sessietabel is preciezer - hij kan unieke bezoekers over
   * dagen heen tellen - maar hij reikt niet verder terug dan de bewaartermijn.
   */
  const dekt = s.length > 0 || dagen <= 7;
  const kern = dekt ? telSessies(s) : telDagen(dagRijen.data ?? []);

  const vorige = (vorigeSessies.data ?? []).length
    ? telSessies(vorigeSessies.data ?? [])
    : null;

  // Dagreeks: uit de dagtotalen als die er zijn, anders uit de sessies zelf -
  // vandaag is nog niet opgerold, dus die zou anders ontbreken.
  const perDagMap = new Map<string, { bezoekers: Set<string>; sessies: number; pageviews: number }>();
  for (const r of s) {
    const dag = String(r.begonnen).slice(0, 10);
    const v = perDagMap.get(dag) ?? { bezoekers: new Set<string>(), sessies: 0, pageviews: 0 };
    v.bezoekers.add(String(r.visitor_id));
    v.sessies += 1;
    v.pageviews += Number(r.pageviews) || 0;
    perDagMap.set(dag, v);
  }
  for (const r of dagRijen.data ?? []) {
    const dag = String(r.dag).slice(0, 10);
    if (perDagMap.has(dag)) continue;
    perDagMap.set(dag, {
      bezoekers: new Set(Array.from({ length: Number(r.bezoekers) || 0 }, (_, i) => "x" + i)),
      sessies: Number(r.sessies) || 0,
      pageviews: Number(r.pageviews) || 0,
    });
  }
  const perDag = Array.from(perDagMap.entries())
    .map(([dag, v]) => ({ dag, bezoekers: v.bezoekers.size, sessies: v.sessies, pageviews: v.pageviews }))
    .sort((a, b) => a.dag.localeCompare(b.dag));

  // Paden: de dagtotalen zijn hier leidend, want die hebben instap en uitstap
  // al per sessie geteld. Vandaag komt uit de sessies erbij.
  const padMap = new Map<string, { pageviews: number; instappen: number; uitstappen: number; duur: number; n: number }>();
  const padBij = (p: string, v: Partial<{ pageviews: number; instappen: number; uitstappen: number; duur: number; n: number }>) => {
    const h = padMap.get(p) ?? { pageviews: 0, instappen: 0, uitstappen: 0, duur: 0, n: 0 };
    h.pageviews += v.pageviews ?? 0;
    h.instappen += v.instappen ?? 0;
    h.uitstappen += v.uitstappen ?? 0;
    h.duur += v.duur ?? 0;
    h.n += v.n ?? 0;
    padMap.set(p, h);
  };
  const opgeroldeDagen = new Set((dagRijen.data ?? []).map((r: any) => String(r.dag).slice(0, 10)));
  for (const r of padRijen.data ?? []) {
    padBij(String(r.path), {
      pageviews: Number(r.pageviews) || 0,
      instappen: Number(r.instappen) || 0,
      uitstappen: Number(r.uitstappen) || 0,
      duur: Number(r.duur_ms_som) || 0,
      n: Number(r.metingen) || 0,
    });
  }
  for (const r of s) {
    if (opgeroldeDagen.has(String(r.begonnen).slice(0, 10))) continue;
    for (const p of (r.paden ?? []) as string[]) padBij(p, { pageviews: 1 });
    if (r.instap) padBij(String(r.instap), { instappen: 1 });
    if (r.uitstap) padBij(String(r.uitstap), { uitstappen: 1, duur: Number(r.duur_ms) || 0, n: 1 });
  }
  const paginas = Array.from(padMap.entries())
    .map(([path, v]) => ({
      path, pageviews: v.pageviews, instappen: v.instappen, uitstappen: v.uitstappen,
      gemSec: v.n ? Math.round(v.duur / 1000 / v.n) : 0,
    }))
    .sort((a, b) => b.pageviews - a.pageviews)
    .slice(0, 25);

  const telOp = (rijen: any[], sleutel: string, waarde = "sessies"): SiteRij[] => {
    const m = new Map<string, number>();
    for (const r of rijen) {
      const k = String(r[sleutel] ?? "?");
      m.set(k, (m.get(k) ?? 0) + (Number(r[waarde]) || 0));
    }
    return Array.from(m.entries())
      .map(([naam, aantal]) => ({ naam, aantal }))
      .sort((a, b) => b.aantal - a.aantal)
      .slice(0, 12);
  };

  // Voor niet-opgerolde dagen tellen we de sessies zelf mee, anders mist
  // vandaag in elke uitsplitsing.
  const versBron = new Map<string, number>();
  const versLand = new Map<string, number>();
  const versDevice = new Map<string, number>();
  const versTech: Record<string, Map<string, number>> = {
    browser: new Map(), os: new Map(), taal: new Map(), scherm: new Map(),
  };
  for (const r of s) {
    if (opgeroldeDagen.has(String(r.begonnen).slice(0, 10))) continue;
    const bron = r.utm_source || r.verwijzer || "direct";
    versBron.set(bron, (versBron.get(bron) ?? 0) + 1);
    const land = r.country || "??";
    versLand.set(land, (versLand.get(land) ?? 0) + 1);
    const dev = r.device || "unknown";
    versDevice.set(dev, (versDevice.get(dev) ?? 0) + 1);
    for (const [soort, veld] of [["browser", r.browser], ["os", r.os],
                                 ["taal", r.taal], ["scherm", r.scherm]] as const) {
      const w = veld || "unknown";
      versTech[soort].set(w, (versTech[soort].get(w) ?? 0) + 1);
    }
  }

  /** Eén soort uit de gecombineerde techniektabel halen. */
  const techVan = (soort: string): SiteRij[] => {
    const m = new Map<string, number>();
    for (const r of techRijen.data ?? []) {
      if (String(r.soort) !== soort) continue;
      const k = String(r.waarde ?? "unknown");
      m.set(k, (m.get(k) ?? 0) + (Number(r.sessies) || 0));
    }
    return Array.from(m.entries()).map(([naam, aantal]) => ({ naam, aantal }));
  };
  const samen = (uitDag: SiteRij[], vers: Map<string, number>): SiteRij[] => {
    const m = new Map(uitDag.map((r) => [r.naam, r.aantal]));
    for (const [k, v] of vers) m.set(k, (m.get(k) ?? 0) + v);
    return Array.from(m.entries())
      .map(([naam, aantal]) => ({ naam, aantal }))
      .sort((a, b) => b.aantal - a.aantal)
      .slice(0, 12);
  };

  return {
    nu: nuRij.count ?? 0,
    kern,
    vorige,
    perDag,
    paginas,
    bronnen: samen(telOp(bronRijen.data ?? [], "bron"), versBron),
    landen: samen(telOp(geoRijen.data ?? [], "country"), versLand),
    devices: samen(telOp(geoRijen.data ?? [], "device"), versDevice),
    browsers: samen(techVan("browser"), versTech.browser),
    besturing: samen(techVan("os"), versTech.os),
    talen: samen(techVan("taal"), versTech.taal),
    schermen: samen(techVan("scherm"), versTech.scherm),
    detailTot: oudste.data?.begonnen ? String(oudste.data.begonnen).slice(0, 10) : null,
  };
}
