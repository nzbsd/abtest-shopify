import { type LoaderFunctionArgs } from "@remix-run/node";
import supabase from "~/db.server";

// Publieke read-only prijstest-config voor het thema (zelfde patroon als
// api.bundle-config). Bron: price_tests in Supabase, geschreven door de
// save-actie in app.price-test.
//
// Het thema gebruikt dit om (a) te weten of er voor dit product een test loopt,
// (b) de bezoeker in een groep te plaatsen, en (c) voor de controlegroep de
// juiste prijs te tonen. Het daadwerkelijk KORTEN gebeurt niet hier maar in de
// Discount Function, die zijn eigen config uit een metafield leest — het thema
// kan dus nooit een korting "verzinnen".
//
// Response:
// {
//   "tests": [{
//     "id": 12,
//     "productId": 10829796737366,       // numeriek, zoals het thema het kent
//     "splitPct": 50,                    // % bezoekers in de TESTgroep
//     "markets": {
//       "united-states": { "currency": "USD", "baseline": 35.93, "test": 37.93, "controlDiscount": 2.00 }
//     }
//   }]
// }

function gidToNum(gid: unknown): number | null {
  const n = parseInt(String(gid ?? "").split("/").pop() || "", 10);
  return Number.isFinite(n) ? n : null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  const headers = new Headers({
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    // Kort cachen: een test start/stopt met directe prijsgevolgen, dus we
    // willen niet dat een CDN minutenlang een gestopte test blijft serveren.
    "Cache-Control": "public, max-age=10, s-maxage=15, stale-while-revalidate=30",
  });

  if (!shop || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) {
    return new Response(JSON.stringify({ error: "Invalid shop param" }), {
      status: 400,
      headers,
    });
  }

  try {
    const { data, error } = await supabase
      .from("price_tests")
      .select("id, product_id, split_pct, markets")
      .eq("shop", shop)
      .eq("status", "running");
    if (error) throw new Error(error.message);

    const tests = (data || [])
      .map((row: any) => {
        const productId = gidToNum(row.product_id);
        if (!productId) return null;

        const markets: Record<string, any> = {};
        for (const m of row.markets || []) {
          if (!m?.market) continue;
          const controlDiscount = Number(m.control_discount);
          // Een test zonder verschil is zinloos en zou de controlegroep een
          // korting van 0 geven; die slaan we over in plaats van door te geven.
          if (!Number.isFinite(controlDiscount) || controlDiscount <= 0) continue;
          markets[String(m.market)] = {
            currency: m.currency ?? null,
            baseline: Number(m.baseline_amount) || null,
            test: Number(m.test_amount) || null,
            controlDiscount,
          };
        }
        if (!Object.keys(markets).length) return null;

        return {
          id: row.id,
          productId,
          splitPct: Number(row.split_pct) || 50,
          markets,
        };
      })
      .filter(Boolean);

    return new Response(JSON.stringify({ tests }), { status: 200, headers });
  } catch (e: any) {
    // Bij twijfel GEEN test teruggeven: dan toont het thema gewoon de prijs
    // zoals hij is, in plaats van een halve testtoestand.
    return new Response(JSON.stringify({ tests: [], error: e?.message ?? "error" }), {
      status: 200,
      headers,
    });
  }
};
