import { type LoaderFunctionArgs } from "@remix-run/node";
import supabase from "~/db.server";

/**
 * Publieke read-only config voor het thema.
 *
 * Bewust GEEN prijzen in dit antwoord. Het thema haalt de prijs van het
 * duplicaat rechtstreeks bij Shopify op via /products/<handle>.js, en krijgt
 * daarmee vanzelf het bedrag in de valuta van de bezoeker. Zou de prijs hier
 * vandaan komen, dan kan hij afwijken van wat de kassa rekent zodra iemand het
 * duplicaat in Shopify aanpast.
 *
 * Response:
 * {
 *   "tests": [{
 *     "id": 12,
 *     "controlProductId": 10829796737366,
 *     "testHandle": "herbies-oregano-b",
 *     "splitPct": 50,
 *     "variantMap": { "45123": 45999, "45124": 46000 }
 *   }]
 * }
 */

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
    // Kort cachen: een test start of stopt met directe gevolgen voor wat de
    // bezoeker betaalt, dus geen CDN dat minutenlang een gestopte test serveert.
    "Cache-Control": "public, max-age=10, s-maxage=15, stale-while-revalidate=30",
  });

  if (!shop || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) {
    return new Response(JSON.stringify({ error: "Invalid shop param" }), { status: 400, headers });
  }

  try {
    const { data, error } = await supabase
      .from("price_tests")
      .select("id, control_product_id, test_product_id, test_product_handle, split_pct, variant_map")
      .eq("shop", shop)
      .eq("status", "running");
    if (error) throw new Error(error.message);

    const tests = (data || [])
      .map((row: any) => {
        const controlProductId = gidToNum(row.control_product_id);
        const testProductId = gidToNum(row.test_product_id);
        if (!controlProductId || !testProductId || !row.test_product_handle) return null;

        // De variantkoppeling is bij een doorverwijzing niet essentieel - de
        // duplicaatpagina kiest zelf zijn variant. Hij wordt alleen gebruikt om
        // een ?variant= in de URL mee te verhuizen; ontbreekt hij, dan valt die
        // parameter weg in plaats van naar het verkeerde product te wijzen.
        const variantMap: Record<string, number> = {};
        for (const p of row.variant_map || []) {
          const c = Number(p?.control_num);
          const t = Number(p?.test_num);
          if (!Number.isFinite(c) || !Number.isFinite(t)) continue;
          variantMap[String(c)] = t;
        }

        return {
          id: row.id,
          controlProductId,
          testProductId,
          testHandle: String(row.test_product_handle),
          splitPct: Number(row.split_pct) || 50,
          variantMap,
        };
      })
      .filter(Boolean);

    return new Response(JSON.stringify({ tests }), { status: 200, headers });
  } catch (e: any) {
    // Bij twijfel geen test teruggeven: dan toont het thema gewoon het
    // originele product, in plaats van een halve testtoestand.
    return new Response(JSON.stringify({ tests: [], error: e?.message ?? "error" }), {
      status: 200,
      headers,
    });
  }
};
