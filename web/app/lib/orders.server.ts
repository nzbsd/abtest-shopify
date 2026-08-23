import type { PriceTest } from "./priceTest.server";

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
 * REBILLS ARE EXCLUDED, and this is the single most important line in the file.
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

  const controlNum = numOf(test.control_product_id);
  const testNum = numOf(test.test_product_id);

  const uit: OrderResultaat = {
    control: leeg(), test: leeg(), perVariant: {}, perDag: {}, perValuta: {},
    rebillsOvergeslagen: 0, afgekapt: false,
  };

  // Only from the moment the test started. Orders before that belong to no
  // group and would only add noise on the control side.
  const sinds = test.started_at || test.created_at || new Date(Date.now() - 30 * 864e5).toISOString();
  const q =
    "created_at:>=" + new Date(sinds).toISOString() +
    " AND (product_id:" + controlNum + " OR product_id:" + testNum + ")";

  let cursor: string | null = null;

  for (let p = 0; p < MAX_PAGINAS; p++) {
    const res: any = await admin.graphql(QUERY, { variables: { q, cursor } });
    const j = await res.json();
    const blok = j?.data?.orders;
    if (!blok) break;

    for (const order of blok.nodes || []) {
      // See the note at the top: renewals are not a response to the tested price.
      if (String(order?.sourceName || "") !== "web") {
        uit.rebillsOvergeslagen += 1;
        continue;
      }

      let cohort: "control" | "test" | null = null;
      let cents = 0;
      let units = 0;
      let sub = false;
      let variantNaam = "(default)";
      let gemengd = false;

      for (const li of order?.lineItems?.nodes || []) {
        const pid = numOf(li?.product?.id || "");
        const isControl = pid === controlNum;
        const isTest = pid === testNum;
        if (!isControl && !isTest) continue;

        const groep = isTest ? "test" : "control";
        // An order holding both products belongs to neither: there is no telling
        // which price drove it.
        if (cohort && cohort !== groep) { gemengd = true; break; }
        cohort = groep;

        const qty = Number(li?.quantity) || 0;
        cents += Math.round(parseFloat(li?.discountedTotalSet?.shopMoney?.amount || "0") * 100);
        units += qty;
        if (li?.sellingPlan?.sellingPlanId) sub = true;
        if (li?.variantTitle) variantNaam = String(li.variantTitle);
        else if (li?.title) variantNaam = String(li.title);
      }

      if (gemengd || !cohort) continue;

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

    if (!blok.pageInfo?.hasNextPage) break;
    cursor = blok.pageInfo.endCursor;
    if (p === MAX_PAGINAS - 1) uit.afgekapt = true;
  }

  cache.set(test.id, { at: Date.now(), data: uit });
  return uit;
}
