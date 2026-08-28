import type { PriceTest } from "./priceTest.server";
import supabase from "~/db.server";

/**
 * Ordercijfers uit price_test_events, met een telling bij Shopify als controle.
 *
 * DIT STOND OOIT ANDERSOM, EN OM EEN GOEDE REDEN. Webhooks zijn een tweede
 * kopie van de waarheid die stil kan afdrijven, en dat was hier geen theorie:
 * de webhook vuurde 269 keer in zes uur en schreef niets weg, en niemand zag
 * het, want een mislukte webhook ziet er precies zo uit als een rustige dag.
 * Daarom werden de orders rechtstreeks bij Shopify gelezen.
 *
 * Die redenering klopt nog steeds. Wat niet meer klopte was de prijs: alle
 * orders ophalen om ze zelf te tellen kostte tot vijfentwintig opeenvolgende
 * verzoeken per test, met alle regelitems erbij, bij elke schermbeurt opnieuw.
 * Bij een test die een week loopt zijn dat duizenden orders per keer, en dat is
 * waarom dit scherm traag opende.
 *
 * Nu komen de tellingen uit de database - een enkele opdracht, geen rijlimiet -
 * en blijft er van Shopify precies over wat er nodig is om te weten of die
 * database compleet is: twee aantallen in een enkel verzoek. Alle orders in het
 * venster tegenover alleen de webshop-orders. Het verschil met wat wij
 * toegewezen hebben staat als `ongetagd` op het scherm, en dat is exact het
 * signaal dat destijds maanden te laat kwam.
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

/**
 * Stond op een minuut toen elke schermbeurt een reeks Shopify-verzoeken kostte.
 * Dat is nu een enkele opdracht plus een telling, dus de cache is er niet meer
 * om het scherm te redden maar om onnodige verzoeken te sparen. Vijf minuten
 * oud is voor een test die dagen loopt geen bezwaar, en wie verser wil kan
 * verversen - orderCijfers kent daar een parameter voor.
 */
const CACHE_MS = 300_000;

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
  /**
   * Blijft nu altijd false. Dit meldde dat de paginalimiet geraakt was bij het
   * ophalen van orders; er wordt niet meer gepagineerd, dus er valt niets meer
   * af te kappen. Het veld blijft staan omdat het scherm het toont.
   */
  afgekapt: boolean;
};

const leeg = (): OrderCijfers => ({
  orders: 0, units: 0, revenueCents: 0, revenueSqCents: 0, subOrders: 0, subRevenueCents: 0,
});

const leegPaar = () => ({ control: leeg(), test: leeg() });

const cache = new Map<number, { at: number; data: OrderResultaat }>();

const numOf = (gid: string) => String(gid).split("/").pop() || "";

/**
 * De controle: twee aantallen in een enkel verzoek.
 *
 * Alles in het venster tegenover alleen de webshop-orders. Het verschil is het
 * aantal verlengingen dat we overslaan, en wat de webshop-telling meer heeft
 * dan wij toegewezen hebben is het aantal orders dat we missen.
 */
const TELLING = `#graphql
  query TestTelling($qAlles: String!, $qWeb: String!) {
    alles: ordersCount(query: $qAlles) { count }
    web: ordersCount(query: $qWeb) { count }
  }
`;

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

  /**
   * En niet verder dan het moment van stoppen.
   *
   * Deze grens ontbrak. Een gestopte test bleef daardoor elke bestelling
   * daarna opeisen: test 2 stopte op 26 augustus en telde de dag erna nog
   * gewoon mee, terwijl die bezoekers zijn pagina nooit gezien hadden.
   *
   * Het scheelt ook wachttijd. Zonder bovengrens haalt elke schermbeurt de
   * volledige ordergeschiedenis sinds de start op, pagina voor pagina, ook
   * voor tests die allang klaar zijn.
   *
   * Een dag speling, want de webhook en de bestelling lopen niet gelijk en een
   * order die net voor het stoppen geplaatst is hoort er nog bij.
   */
  const speling = 864e5;
  const tot = test.stopped_at ? new Date(Date.parse(test.stopped_at) + speling).toISOString() : null;

  const producten = !productGebonden
    ? ""
    : controlNum === testNum
      ? " AND product_id:" + controlNum
      : " AND (product_id:" + controlNum + " OR product_id:" + testNum + ")";
  const q = "created_at:>=" + new Date(sinds).toISOString()
    + (tot ? " AND created_at:<=" + tot : "")
    + producten;

  /**
   * De cijfers komen uit price_test_events, de controle uit Shopify.
   *
   * Hierboven stond waarom dit ooit andersom was: webhooks zijn een tweede
   * kopie van de waarheid die stil kan afdrijven, en dat was hier geen theorie -
   * de webhook heeft maandenlang niets weggeschreven zonder dat iemand het zag.
   * Die redenering klopt nog steeds, dus de controle blijft.
   *
   * Wat er veranderd is: alle orders ophalen om ze zelf te tellen kostte tot
   * vijfentwintig opeenvolgende Shopify-verzoeken per test, met alle regelitems
   * erbij, bij elke schermbeurt opnieuw. Dat is waarom dit scherm traag opende.
   * De tellingen zelf staan al in de database en komen daar in een enkele
   * opdracht uit.
   *
   * Blijft over: weten of die database compleet is. Daarvoor is geen volledige
   * ordergeschiedenis nodig, alleen een aantal. Twee tellingen in een enkel
   * verzoek - alle orders in het venster, en die via de webshop - geven zowel
   * het aantal overgeslagen verlengingen als het verschil met wat wij hebben.
   * Loopt dat uiteen, dan is dat precies het signaal dat vandaag maanden te
   * laat kwam.
   */
  const { data: agg, error: aggFout } = await supabase.rpc('price_test_ordercijfers', {
    p_shop: test.shop,
    p_test_id: test.id,
  });
  if (aggFout) throw new Error(aggFout.message);

  const vul = (doel: OrderCijfers, bron: any) => {
    if (!bron) return;
    doel.orders = Number(bron.orders) || 0;
    doel.units = Number(bron.units) || 0;
    doel.revenueCents = Number(bron.revenueCents) || 0;
    doel.revenueSqCents = Number(bron.revenueSqCents) || 0;
    doel.subOrders = Number(bron.subOrders) || 0;
    doel.subRevenueCents = Number(bron.subRevenueCents) || 0;
  };
  const vulPaar = (bron: any): { control: OrderCijfers; test: OrderCijfers } => {
    const paar = leegPaar();
    vul(paar.control, bron?.control);
    vul(paar.test, bron?.test);
    return paar;
  };

  vul(uit.control, (agg as any)?.totaal?.control);
  vul(uit.test, (agg as any)?.totaal?.test);
  for (const [k, v] of Object.entries((agg as any)?.perDag || {})) uit.perDag[k] = vulPaar(v);
  for (const [k, v] of Object.entries((agg as any)?.perVariant || {})) uit.perVariant[k] = vulPaar(v);
  for (const [k, v] of Object.entries((agg as any)?.perValuta || {})) uit.perValuta[k] = vulPaar(v);

  try {
    const res: any = await admin.graphql(TELLING, {
      variables: { qAlles: q, qWeb: q + ' AND source_name:web' },
    });
    const j = await res.json();
    const alles = Number(j?.data?.alles?.count);
    const web = Number(j?.data?.web?.count);
    if (Number.isFinite(alles) && Number.isFinite(web)) {
      uit.rebillsOvergeslagen = Math.max(0, alles - web);
      // Webshop-orders in het venster die wij niet hebben toegewezen. Dat zijn
      // bezoekers die het geteste product kochten zonder ooit de geteste pagina
      // te passeren - en, als het er veel zijn, een teken dat er iets misgaat
      // in de toewijzing.
      uit.ongetagd = Math.max(0, web - (uit.control.orders + uit.test.orders));
    }
  } catch {
    // De cijfers staan er al; zonder controle blijft rebills en ongetagd nul.
  }

  cache.set(test.id, { at: Date.now(), data: uit });
  return uit;
}
