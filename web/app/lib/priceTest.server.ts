import supabase from "~/db.server";

/**
 * Kern van de prijstest: prijzen per markt zetten en terugdraaien.
 *
 * MECHANIEK
 * Elke markt heeft in deze shop een eigen price list met adjustment 0%, dus de
 * marktprijzen zijn afgeleid van de basisprijs. Om in één markt een andere
 * prijs te testen zetten we daar een VASTE prijs in die price list. Stoppen is
 * dan het verwijderen van die vaste prijs: de markt valt automatisch terug op
 * de afgeleide prijs.
 *
 * Waarom niet de basisprijs verhogen: dat raakt alle markten tegelijk en
 * herstellen hangt dan af van een opgeslagen oude waarde. Met fixed prices is
 * terugdraaien een delete en blijft de basisprijs onaangeroerd.
 *
 * De controlegroep krijgt het verschil terug via de Discount Function; die
 * leest zijn config uit het metafield dat hier wordt geschreven.
 */

export type MarketConfig = {
  market: string;          // market handle, bv 'united-states'
  price_list_id: string;   // gid://shopify/PriceList/...
  currency: string;        // USD, GBP, ...
  baseline_amount: number; // prijs zoals hij zonder test zou zijn
  test_amount: number;     // prijs die de testgroep betaalt
  control_discount: number; // test_amount - baseline_amount
};

export type PriceTest = {
  id: number;
  shop: string;
  product_id: string;
  product_title: string | null;
  status: "draft" | "running" | "stopped";
  split_pct: number;
  markets: MarketConfig[];
  started_at: string | null;
  stopped_at: string | null;
};

/** Variant-ids van een product; fixed prices gelden per variant. */
export async function variantIds(admin: any, productId: string): Promise<string[]> {
  const res: any = await admin.graphql(
    `#graphql
     query Variants($id: ID!) {
       product(id: $id) { variants(first: 100) { nodes { id } } }
     }`,
    { variables: { id: productId } },
  );
  const j = await res.json();
  return (j?.data?.product?.variants?.nodes || []).map((v: any) => v.id);
}

/**
 * Zet de testprijs in de price lists van de geselecteerde markten.
 * Faalt er één markt, dan draaien we de al gezette markten terug: half
 * doorgevoerd is erger dan niet doorgevoerd, want dan betaalt één markt de
 * testprijs zonder dat de test loopt.
 */
export async function applyTestPrices(
  admin: any,
  productId: string,
  markets: MarketConfig[],
): Promise<{ ok: boolean; error?: string }> {
  const ids = await variantIds(admin, productId);
  if (!ids.length) return { ok: false, error: "Product heeft geen varianten" };

  const gedaan: MarketConfig[] = [];
  for (const m of markets) {
    const res: any = await admin.graphql(
      `#graphql
       mutation SetPrices($priceListId: ID!, $prices: [PriceListPriceInput!]!) {
         priceListFixedPricesAdd(priceListId: $priceListId, prices: $prices) {
           userErrors { field message }
         }
       }`,
      {
        variables: {
          priceListId: m.price_list_id,
          prices: ids.map((variantId) => ({
            variantId,
            price: { amount: m.test_amount.toFixed(2), currencyCode: m.currency },
          })),
        },
      },
    );
    const j = await res.json();
    const errs = j?.data?.priceListFixedPricesAdd?.userErrors || [];
    if (errs.length) {
      await revertTestPrices(admin, productId, gedaan);
      return { ok: false, error: `${m.market}: ${errs[0].message}` };
    }
    gedaan.push(m);
  }
  return { ok: true };
}

/** Vaste prijzen weghalen; de markt valt terug op de afgeleide prijs. */
export async function revertTestPrices(
  admin: any,
  productId: string,
  markets: MarketConfig[],
): Promise<{ ok: boolean; error?: string }> {
  const ids = await variantIds(admin, productId);
  let laatsteFout: string | undefined;

  for (const m of markets) {
    const res: any = await admin.graphql(
      `#graphql
       mutation ClearPrices($priceListId: ID!, $variantIds: [ID!]!) {
         priceListFixedPricesDelete(priceListId: $priceListId, variantIds: $variantIds) {
           userErrors { field message }
         }
       }`,
      { variables: { priceListId: m.price_list_id, variantIds: ids } },
    );
    const j = await res.json();
    const errs = j?.data?.priceListFixedPricesDelete?.userErrors || [];
    // Doorgaan bij een fout: elke markt die we WEL kunnen herstellen moet
    // hersteld worden. Een blijvend hoge prijs is het ergste scenario.
    if (errs.length) laatsteFout = `${m.market}: ${errs[0].message}`;
  }
  return laatsteFout ? { ok: false, error: laatsteFout } : { ok: true };
}

/**
 * Schrijft de config voor de Discount Function. Vorm bewust plat per valuta:
 * de function kent geen market-handles, alleen de valuta van de cartregel.
 */
export function buildFunctionConfig(tests: PriceTest[]) {
  return {
    tests: tests
      .filter((t) => t.status === "running")
      .map((t) => ({
        id: t.id,
        productId: t.product_id,
        markets: Object.fromEntries(
          (t.markets || [])
            .filter((m) => Number(m.control_discount) > 0)
            .map((m) => [m.currency, { controlDiscount: Number(m.control_discount) }]),
        ),
      }))
      .filter((t) => Object.keys(t.markets).length > 0),
  };
}

/** Config naar het metafield van de automatische korting. */
export async function writeFunctionConfig(
  admin: any,
  discountNodeId: string,
  config: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const res: any = await admin.graphql(
    `#graphql
     mutation SetConfig($mf: [MetafieldsSetInput!]!) {
       metafieldsSet(metafields: $mf) { userErrors { field message } }
     }`,
    {
      variables: {
        mf: [
          {
            ownerId: discountNodeId,
            namespace: "$app:price-test",
            key: "function-configuration",
            type: "json",
            value: JSON.stringify(config),
          },
        ],
      },
    },
  );
  const j = await res.json();
  const errs = j?.data?.metafieldsSet?.userErrors || [];
  return errs.length ? { ok: false, error: errs[0].message } : { ok: true };
}

export async function loadTests(shop: string): Promise<PriceTest[]> {
  const { data, error } = await supabase
    .from("price_tests")
    .select("*")
    .eq("shop", shop)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as PriceTest[];
}
