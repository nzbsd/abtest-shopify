import { type LoaderFunctionArgs } from "@remix-run/node";
import supabase from "~/db.server";

/**
 * Public read-only config for the theme.
 *
 * Deliberately no prices in the response. The theme reads those from Shopify
 * itself, so what is shown cannot drift from what the checkout charges.
 *
 * One entry per running test, shaped by its type. The theme only needs to know
 * what to do, not what the test is about:
 *
 *   price     -> send the test group to another product's URL
 *   template  -> add ?view=<suffix> on the same URL
 *   url       -> send from one path to another
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
    // Short cache: starting or stopping a test changes what visitors are
    // charged, so no CDN should serve a stopped test for minutes.
    "Cache-Control": "public, max-age=10, s-maxage=15, stale-while-revalidate=30",
  });

  if (!shop || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) {
    return new Response(JSON.stringify({ error: "Invalid shop param" }), { status: 400, headers });
  }

  try {
    const { data, error } = await supabase
      .from("price_tests")
      .select(
        "id, test_type, control_product_id, test_product_id, test_product_handle, " +
        "template_suffix, image_positie, control_url, test_url, test_theme_id, split_pct, variant_map, " +
        "target_devices, target_countries",
      )
      .eq("shop", shop)
      .eq("status", "running");
    if (error) throw new Error(error.message);

    const tests = (data || [])
      .map((row: any) => {
        const type = String(row.test_type || "price");
        const splitPct = Number(row.split_pct) || 50;

        // Targeting reist mee als lege lijsten wanneer er geen beperking is,
        // zodat het thema één regel hoeft te kennen: leeg betekent iedereen.
        const doelgroep = {
          devices: Array.isArray(row.target_devices) ? row.target_devices : [],
          countries: Array.isArray(row.target_countries) ? row.target_countries : [],
        };

        if (type === "url") {
          if (!row.control_url || !row.test_url) return null;
          return { id: row.id, type, splitPct, doelgroep, controlPath: row.control_url, testPath: row.test_url };
        }

        if (type === "theme") {
          const themeId = parseInt(String(row.test_theme_id ?? "").split("/").pop() || "", 10);
          if (!Number.isFinite(themeId)) return null;
          return { id: row.id, type, splitPct, doelgroep, themeId };
        }

        const controlProductId = gidToNum(row.control_product_id);
        if (!controlProductId) return null;

        if (type === "image") {
          /* Zonder positie geen test. Hem toch uitserveren zou het thema laten
             zoeken naar een foto die er niet is: de galerij blijft staan,
             beide groepen zien hetzelfde, en de uitslag rapporteert straks
             keurig een verschil van nul alsof dat een bevinding was. */
          const pos = Number(row.image_positie);
          if (!Number.isInteger(pos) || pos < 2) return null;
          return { id: row.id, type, splitPct, doelgroep, controlProductId, imagePositie: pos };
        }

        if (type === "template") {
          if (!row.template_suffix) return null;
          return { id: row.id, type, splitPct, doelgroep, controlProductId, suffix: String(row.template_suffix) };
        }

        // price
        const testProductId = gidToNum(row.test_product_id);
        if (!testProductId || !row.test_product_handle) return null;

        // Only used to carry a ?variant= across; without it that parameter is
        // dropped rather than pointing at the other product's variant.
        const variantMap: Record<string, number> = {};
        for (const p of row.variant_map || []) {
          const c = Number(p?.control_num);
          const t = Number(p?.test_num);
          if (Number.isFinite(c) && Number.isFinite(t)) variantMap[String(c)] = t;
        }

        return {
          id: row.id, type, splitPct, doelgroep, controlProductId, testProductId,
          testHandle: String(row.test_product_handle), variantMap,
        };
      })
      .filter(Boolean);

    return new Response(JSON.stringify({ tests }), { status: 200, headers });
  } catch (e: any) {
    // On doubt return no tests: the visitor then simply sees the normal page
    // instead of half a test.
    //
    // De reden gaat naar de log en niet naar het antwoord. Dit eindpunt staat
    // open voor iedereen die het shopdomein raadt, en een databasefout die
    // letterlijk teruggegeven wordt vertelt een vreemde welke tabellen er zijn
    // en waar het misgaat. Voor de bezoeker maakt het niets uit: die krijgt in
    // beide gevallen gewoon de normale pagina.
    console.error("price-test config", e?.message ?? e);
    return new Response(JSON.stringify({ tests: [] }), { status: 200, headers });
  }
};
