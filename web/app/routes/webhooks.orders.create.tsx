import { type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import supabase from "~/db.server";

/**
 * Omzet per testgroep.
 *
 * De groep leiden we af uit WELK PRODUCT er gekocht is, niet uit de
 * cart-attributen. Het origineel is de controlegroep, het duplicaat de
 * testgroep - dat staat vast in de order en kan niet meer verschuiven. Een
 * cart-attribuut kan ontbreken als de bezoeker via een andere weg binnenkwam,
 * of achterhaald zijn als de cart is hergebruikt; het product-id niet.
 *
 * De attributen gebruiken we nog wel voor context: markt en bezoeker.
 *
 * Idempotent: unieke index op (shop, order_id) plus ignoreDuplicates. Shopify
 * levert webhooks soms dubbel, en dubbeltelling zou de omzet van een groep te
 * hoog maken en daarmee de uitslag verkeerd doen lijken.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, topic } = await authenticate.webhook(request);
  if (topic !== "ORDERS_CREATE") return new Response(null, { status: 200 });

  try {
    const { data: tests } = await supabase
      .from("price_tests")
      .select("id, control_product_id, test_product_id")
      .eq("shop", shop)
      .in("status", ["running", "stopped"]);

    if (!tests?.length) return new Response(null, { status: 200 });

    const num = (gid: string) => String(gid).split("/").pop();

    // Per test: welke regels horen erbij, en in welke groep.
    for (const t of tests) {
      const controlNum = num(t.control_product_id);
      const testNum = num(t.test_product_id);

      let cents = 0;
      let cohort: "control" | "test" | null = null;

      for (const li of (payload as any)?.line_items || []) {
        const pid = String(li?.product_id);
        const isControl = pid === controlNum;
        const isTest = pid === testNum;
        if (!isControl && !isTest) continue;

        // Een order met beide producten hoort in geen van beide groepen: dan
        // is niet te zeggen welke prijs het gedrag stuurde. Overslaan is
        // eerlijker dan gokken.
        const dezeGroep = isTest ? "test" : "control";
        if (cohort && cohort !== dezeGroep) {
          cohort = null;
          break;
        }
        cohort = dezeGroep;

        // Wat de klant echt betaalde: prijs minus toegekende kortingen, dus
        // inclusief het effect van de bundelkorting.
        const bruto = Math.round(parseFloat(li?.price || "0") * 100) * (li?.quantity || 0);
        const korting = ((li?.discount_allocations || []) as any[]).reduce(
          (a, d) => a + Math.round(parseFloat(d?.amount || "0") * 100),
          0,
        );
        cents += Math.max(0, bruto - korting);
      }

      if (!cohort) continue;

      const attrs: Record<string, string> = {};
      for (const a of (payload as any)?.note_attributes || []) {
        if (a?.name) attrs[String(a.name)] = String(a.value ?? "");
      }

      await supabase.from("price_test_events").upsert(
        {
          shop,
          test_id: t.id,
          cohort,
          event_type: "purchase",
          product_id: cohort === "test" ? t.test_product_id : t.control_product_id,
          market: attrs["_pt_market"] || null,
          currency: (payload as any)?.currency || null,
          visitor_id: attrs["_pt_visitor"] || null,
          cart_token: (payload as any)?.cart_token || null,
          order_id: String((payload as any)?.id ?? ""),
          revenue_cents: cents,
        },
        { onConflict: "shop,order_id", ignoreDuplicates: true },
      );
    }
  } catch (_e) {
    // Nooit een niet-200 teruggeven: Shopify blijft dan opnieuw sturen en dat
    // levert alleen meer dubbele rijen op. De order is al geplaatst; hier valt
    // niets meer te herstellen.
  }

  return new Response(null, { status: 200 });
};
