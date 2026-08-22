import { type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import supabase from "~/db.server";

/**
 * Omzet per testgroep.
 *
 * Het thema zet bij de cohorttoewijzing twee cart-attributen: _pt_cohort en
 * _pt_test. Die komen mee in de order (note_attributes), zodat we hier weten
 * in welke groep de koper zat zonder cookies of PII aan te raken.
 *
 * Idempotent: price_test_events heeft een unieke index op (shop, order_id), en
 * we schrijven met upsert + ignoreDuplicates. Shopify levert webhooks soms
 * dubbel; zonder die borging zou de omzet van een groep te hoog uitvallen en
 * daarmee de uitslag van de test verkeerd doen lijken.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, topic } = await authenticate.webhook(request);
  if (topic !== "ORDERS_CREATE") return new Response(null, { status: 200 });

  try {
    const attrs: Record<string, string> = {};
    for (const a of (payload as any)?.note_attributes || []) {
      if (a?.name) attrs[String(a.name)] = String(a.value ?? "");
    }

    const cohort = (attrs["_pt_cohort"] || "").toLowerCase();
    const testId = parseInt(attrs["_pt_test"] || "", 10);
    if ((cohort !== "control" && cohort !== "test") || !Number.isFinite(testId)) {
      // Geen prijstest-order — niets te doen.
      return new Response(null, { status: 200 });
    }

    // Alleen de omzet van het geteste product telt, niet de hele order: een
    // klant kan er andere producten bij leggen en die zeggen niets over de
    // prijstest.
    const { data: test } = await supabase
      .from("price_tests")
      .select("id, product_id")
      .eq("id", testId)
      .eq("shop", shop)
      .maybeSingle();
    if (!test) return new Response(null, { status: 200 });

    const productNum = String(test.product_id).split("/").pop();
    let cents = 0;
    for (const li of (payload as any)?.line_items || []) {
      if (String(li?.product_id) !== productNum) continue;
      // Prijs na korting: dit is wat de klant echt betaalde, dus inclusief de
      // teruggave die de controlegroep van de Function kreeg.
      const bruto = Math.round(parseFloat(li?.price || "0") * 100) * (li?.quantity || 0);
      const korting = ((li?.discount_allocations || []) as any[]).reduce(
        (a, d) => a + Math.round(parseFloat(d?.amount || "0") * 100),
        0,
      );
      cents += Math.max(0, bruto - korting);
    }

    await supabase
      .from("price_test_events")
      .upsert(
        {
          shop,
          test_id: testId,
          cohort,
          event_type: "purchase",
          product_id: test.product_id,
          market: attrs["_pt_market"] || null,
          currency: (payload as any)?.currency || null,
          visitor_id: attrs["_pt_visitor"] || null,
          cart_token: (payload as any)?.cart_token || null,
          order_id: String((payload as any)?.id ?? ""),
          revenue_cents: cents,
        },
        { onConflict: "shop,order_id", ignoreDuplicates: true },
      );
  } catch (_e) {
    // Nooit een niet-200 teruggeven: Shopify blijft dan opnieuw sturen en dat
    // levert alleen maar meer dubbele rijen op. De fout is hier niet
    // herstelbaar — de order is al geplaatst.
  }

  return new Response(null, { status: 200 });
};
