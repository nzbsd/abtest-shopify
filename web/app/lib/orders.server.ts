import type { PriceTest } from "./priceTest.server";
import supabase from "~/db.server";

/**
 * Order numbers read straight from Shopify instead of from webhook events.
 *
 * Why not webhooks: they are a second copy of the truth that can silently drift.
 * That is not hypothetical here — the webhook fired 269 times in six hours and
 * wrote nothing, and nobody noticed because a failed webhook looks exactly like
 * a quiet day. Reading the orders means the dashboard cannot be wrong about
 * something Shopify already knows, and it fills in retroactively rather than
 * only from the moment a bug was fixed.
 *
 * What it costs: an API call per dashboard load rather than a cheap table read.
 * Cached briefly, and the query is filtered down to the two products in the
 * test, so it stays small.
 *
 * ORDERS ARE ATTRIBUTED BY COHORT TAG, NOT BY PRODUCT. This is the thing to
 * understand before changing anything here.
 *
 * The obvious approach - control product means control group - is wrong on a
 * real store, and badly so. The original is sold through ads, email, upsells
 * and a quiz; the duplicate is only ever reached through the redirect. Counting
 * by product put every one of those funnels in the control group while their
 * visitors were never counted, and produced a "conversion rate" of 13.9%
 * against 2.4% - more orders than measured visitors on one side.
 *
 * The theme writes _pt_cohort and _pt_test into the cart, so the order says
 * which group the buyer was in. An order without those tags came from someone
 * who never passed the tested page and is skipped: counting a purchase whose
 * visit was never counted is what broke the ratio in the first place.
 *
 * REBILLS ARE EXCLUDED, and this is the second most important line in the file.
 * A subscription renewal carries sourceName "subscription_contract_checkout_one"
 * and has nothing to do with the price being tested — it was agreed months ago.
 * The original product carries an existing subscriber base and the duplicate is
 * brand new, so counting renewals would hand the control group a pile of orders
 * the test group can never have. The test would read as a catastrophic loss for
 * the new price while measuring nothing at all.
 */

const PAGINA = 100;
const MAX_PAGINAS = 25;          // 2500 orders; beyond that we say so rather than silently truncate
const CACHE_MS = 60_000;

export type OrderCijfers = {
  orders: number;
  units: number;
  revenueCents: number;
  /** Sum of squares of the per-order amounts, for the significance test. */
  revenueSqCents: number;
  subOrders: number;
  subRevenueCents: number;
};

export type OrderResultaat = {
  control: OrderCijfers;
  test: OrderCijfers;
  /** [variantnaam][cohort] -> aantallen */
  perVariant: Record<string, { control: OrderCijfers; test: OrderCijfers }>;
  /** [dag][cohort] -> aantallen */
  perDag: Record<string, { control: OrderCijfers; test: OrderCijfers }>;
  /**
   * [valuta][cohort] -> aantallen.
   *
   * Valuta als benadering van de markt: een order draagt geen market-handle,
   * maar deze winkel heeft per markt een eigen valuta, dus USD/GBP/EUR splitst
   * precies zoals de markten dat doen.
   */
  perValuta: Record<string, { control: OrderCijfers; test: OrderCijfers }>;
  /** Renewals seen and skipped; shown so the exclusion is visible rather than silent. */
  rebillsOvergeslagen: number;
  /** Orders without a cohort tag: bought without passing the tested page. */
  ongetagd: number;
  /** True when the page cap was hit and numbers are therefore incomplete. */
  afgekapt: boolean;
};

const leeg = (): OrderCijfers => ({
  orders: 0, units: 0, revenueCents: 0, revenueSqCents: 0, subOrders: 0, subRevenueCents: 0,
});

const leegPaar = () => ({ control: leeg(), test: leeg() });

const cache = new Map<number, { at: number; data: OrderResultaat }>();

const numOf = (gid: string) => String(gid).split("/").pop() || "";

const QUERY = `#graphql
  query TestOrders($q: String!, $cursor: String) {
    orders(first: ${PAGINA}, after: $cursor, query: $q, sortKey: CREATED_AT) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id createdAt sourceName presentmentCurrencyCode
        customAttributes { key value }
        lineItems(first: 25) {
          nodes {
            quantity title variantTitle
            product { id }
            sellingPlan { sellingPlanId }
            discountedTotalSet { shopMoney { amount } }
          }
        }
      }
    }
  }`;

export async function orderCijfers(
  admin: any,
  test: PriceTest,
  opnieuw = false,
): Promise<OrderResultaat> {
  const hit = cache.get(test.id);
  if (!opnieuw && hit && Date.now() - hit.at < CACHE_MS) return hit.data;

  /**
   * Hangt deze test aan een product?
   *
   * Prijs- en template-tests wel: daar is de vraag wat één bepaald product doet,
   * dus filteren we de orders daarop en tellen we alleen die regels mee.
   *
   * Url- en thema-tests niet. Die veranderen een pagina of de hele winkel, en
   * de bezoeker kan vervolgens van alles kopen; de uitkomst is de héle order.
   * Op een product filteren zou daar een deel van het effect wegsnijden - en
   * erger, control_product_id bevat bij een url-test een pad en bij een
   * thema-test niets, dus het filter werd "product_id:NaN" en leverde nul
   * orders op zonder ook maar iets te melden.
   */
  const productGebonden = test.test_type === "price" || test.test_type === "template";
  const controlNum = productGebonden ? numOf(test.control_product_id || "") : "";
  const testNum = productGebonden && test.test_product_id ? numOf(test.test_product_id) : controlNum;

  const uit: OrderResultaat = {
    control: leeg(), test: leeg(), perVariant: {}, perDag: {}, perValuta: {},
    rebillsOvergeslagen: 0, ongetagd: 0, afgekapt: false,
  };

  // Only from the moment the test started. Orders before that belong to no
  // group and would only add noise on the control side.
  const sinds = test.started_at || test.created_at || new Date(Date.now() - 30 * 864e5).toISOString();
  const producten = !productGebonden
    ? ""
    : controlNum === testNum
      ? " AND product_id:" + controlNum
      : " AND (product_id:" + controlNum + " OR product_id:" + testNum + ")";
  const q = "created_at:>=" + new Date(sinds).toISOString() + producten;

  let cursor: string | null = null;

  /**
   * Eerst alle orders ophalen, dan pas tellen.
   *
   * Dat is nodig voor de terugval hieronder: die zoekt de bezoekers van
   * ongetagde orders in één keer op in de vastgelegde views, en dat kan alleen
   * als je weet welke bezoekers je zoekt.
   */
  const verzameld: any[] = [];

  for (let p = 0; p < MAX_PAGINAS; p++) {
    const res: any = await admin.graphql(QUERY, { variables: { q, cursor } });
    const j = await res.json();
    const blok = j?.data?.orders;
    if (!blok) break;

    verzameld.push(...(blok.nodes || []));

    if (!blok.pageInfo?.hasNextPage) break;
    cursor = blok.pageInfo.endCursor;
    if (p === MAX_PAGINAS - 1) uit.afgekapt = true;
  }

  /**
   * Welk cohort hoort bij welke order?
   *
   * Eerst het kenmerk op de winkelwagen. Ontbreekt dat, dan kijken we welk
   * cohort deze bezoeker kreeg toen hij de pagina zag - dat staat vast in zijn
   * eigen view-gebeurtenis, en dat is geen gok maar dezelfde toewijzing.
   *
   * Die terugval is er omdat het kenmerk maandenlang niet aankwam: cartToken()
   * had een ontbrekende backslash in zijn cookie-regex, waardoor de bewaking in
   * tagCart een sessie lang op dezelfde waarde bleef staan en het cohort nooit
   * naar de winkelwagen ging. Van de eerste vijfendertig orders van de
   * paginatest droeg er één het kenmerk. Op de bezoeker kwamen er drieëndertig
   * terug, en bij de drie die het kenmerk wél hadden gaf de opzoeking exact
   * hetzelfde antwoord.
   */
  const ongetagdeBezoekers = new Set<string>();
  for (const order of verzameld) {
    if (String(order?.sourceName || "") !== "web") continue;
    const a: Record<string, string> = {};
    for (const x of order?.customAttributes || []) if (x?.key) a[String(x.key)] = String(x.value ?? "");
    const eigen = a["_pt_" + test.id];
    const oud = String(a["_pt_test"] || "") === String(test.id) ? a["_pt_cohort"] : undefined;
    if (eigen !== "control" && eigen !== "test" && oud !== "control" && oud !== "test") {
      const v = a["_pt_visitor"];
      if (v) ongetagdeBezoekers.add(v);
    }
  }

  const bezoekerCohort = new Map<string, "control" | "test">();
  if (ongetagdeBezoekers.size) {
    try {
      // Alleen de bezoekers die we nodig hebben. Een test kan honderdduizend
      // bezoekers hebben; die hele lijst ophalen om er dertig te vinden zou
      // het scherm traag maken zonder iets toe te voegen.
      const { data } = await supabase
        .from("price_test_events")
        .select("visitor_id, cohort")
        .eq("shop", test.shop)
        .eq("test_id", test.id)
        .eq("event_type", "view")
        .in("visitor_id", [...ongetagdeBezoekers]);
      for (const r of data || []) {
        const c = String((r as any).cohort);
        if (c === "control" || c === "test") bezoekerCohort.set(String((r as any).visitor_id), c);
      }
    } catch {
      // Geen terugval dan: die orders blijven ongetagd, precies zoals eerst.
    }
  }

  {
    for (const order of verzameld) {
      // See the note at the top: renewals are not a response to the tested price.
      if (String(order?.sourceName || "") !== "web") {
        uit.rebillsOvergeslagen += 1;
        continue;
      }

      // The cohort comes from the cart tag, not from the product.
      const attrs: Record<string, string> = {};
      for (const a of order?.customAttributes || []) {
        if (a?.key) attrs[String(a.key)] = String(a.value ?? "");
      }
      // Eerst de sleutel van deze test zelf. Een bezoeker kan in meer dan één
      // test zitten - een thema-test loopt over elke pagina en overlapt dus met
      // elke producttest eronder - en dan kan het oude _pt_test/_pt_cohort-paar
      // er maar één dragen. Dat paar blijft de terugval, zodat orders van vóór
      // deze verandering toegewezen blijven.
      const eigen = attrs["_pt_" + test.id];
      const oud = String(attrs["_pt_test"] || "") === String(test.id) ? attrs["_pt_cohort"] : undefined;
      let getagd: string | undefined = eigen ?? oud;
      if (getagd !== "control" && getagd !== "test") {
        // Geen kenmerk op de wagen: terugval op het cohort dat deze bezoeker
        // kreeg toen hij de pagina zag.
        getagd = bezoekerCohort.get(attrs["_pt_visitor"] || "");
      }
      if (getagd !== "control" && getagd !== "test") { uit.ongetagd += 1; continue; }
      const cohort: "control" | "test" = getagd;

      let cents = 0;
      let units = 0;
      let sub = false;
      // Zonder product is er ook geen variant om op te splitsen: de tabel
      // krijgt dan één regel die zegt dat het om de hele order gaat, in plaats
      // van een uitsplitsing te suggereren die er niet is.
      let variantNaam = productGebonden ? "(default)" : "(whole order)";

      for (const li of order?.lineItems?.nodes || []) {
        if (productGebonden) {
          const pid = numOf(li?.product?.id || "");
          if (pid !== controlNum && pid !== testNum) continue;
        }

        const qty = Number(li?.quantity) || 0;
        cents += Math.round(parseFloat(li?.discountedTotalSet?.shopMoney?.amount || "0") * 100);
        units += qty;
        if (li?.sellingPlan?.sellingPlanId) sub = true;
        if (productGebonden) {
          if (li?.variantTitle) variantNaam = String(li.variantTitle);
          else if (li?.title) variantNaam = String(li.title);
        }
      }

      // Nothing of the tested product in this order - the tag was set on an
      // earlier visit but they bought something else.
      if (cents === 0 && units === 0) continue;

      const tel = (g: OrderCijfers) => {
        g.orders += 1;
        g.units += units;
        g.revenueCents += cents;
        g.revenueSqCents += cents * cents;
        if (sub) { g.subOrders += 1; g.subRevenueCents += cents; }
      };

      tel(uit[cohort]);

      uit.perVariant[variantNaam] ||= leegPaar();
      tel(uit.perVariant[variantNaam][cohort]);

      const dag = String(order.createdAt).slice(0, 10);
      uit.perDag[dag] ||= leegPaar();
      tel(uit.perDag[dag][cohort]);

      const valuta = String(order.presentmentCurrencyCode || "?");
      uit.perValuta[valuta] ||= leegPaar();
      tel(uit.perValuta[valuta][cohort]);
    }
  }

  cache.set(test.id, { at: Date.now(), data: uit });
  return uit;
}
