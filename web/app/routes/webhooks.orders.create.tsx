import { type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import supabase from "~/db.server";

/**
 * Revenue and order composition per test group.
 *
 * The group is derived from WHICH PRODUCT was bought, not from the cart
 * attributes. The original is the control, the duplicate is the test, and that
 * is fixed in the order and cannot drift. A cart attribute can be missing if
 * the visitor arrived another way, or stale if the cart was reused; a product
 * id cannot.
 *
 * The attributes are still used for context: market and visitor.
 *
 * Beyond the amount we now also record how the order was composed —
 * subscription or one-off, how many units, which variant. For a price test
 * that is often the more useful half: revenue going down tells you something
 * changed, the composition tells you what.
 *
 * Idempotent: unique index on (shop, order_id) plus ignoreDuplicates. Shopify
 * delivers webhooks twice sometimes, and double counting would inflate one
 * group's revenue and flip the verdict.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, topic } = await authenticate.webhook(request);
  if (topic !== "ORDERS_CREATE") return new Response(null, { status: 200 });

  /**
   * De order koppelen aan het bezoek dat hem opleverde.
   *
   * Staat los van alles hieronder, want dit gaat over de bezoekersanalytics en
   * niet over een test - het geldt voor élke order, ook als er geen test loopt.
   *
   * Het sessie-id komt uit de cart-attributen die het thema-snippet er bij de
   * eerste pagina in zet. Dat is de enige route: theme.liquid rendert niet op
   * de order-status pagina, dus daar valt niets te meten. En het bedrag komt
   * hier van Shopify, niet uit JavaScript dat een adblocker kan tegenhouden.
   *
   * Rebills tellen niet mee, om dezelfde reden als bij de tests: die zijn
   * maanden geleden afgesproken en horen bij geen enkel bezoek van vandaag.
   */
  try {
    const attrsAlle: Record<string, string> = {};
    for (const a of (payload as any)?.note_attributes || []) {
      if (a?.name) attrsAlle[String(a.name)] = String(a.value ?? "");
    }
    const sess = attrsAlle["_pt_sess"];
    const bron = String((payload as any)?.source_name || "");

    if (sess && bron === "web") {
      const cents = Math.round(parseFloat((payload as any)?.total_price || "0") * 100);
      /**
       * Via het orderboek, niet rechtstreeks optellen.
       *
       * site_order deed vroeger `orders = orders + 1` zonder ergens vast te
       * leggen wélke order dat was. Shopify levert een webhook soms twee keer,
       * en dan telde hij twee keer. Erger nog: er viel achteraf niet te zien
       * wat er al in zat, dus een herstelactie kon alleen door alles op nul te
       * zetten en opnieuw op te bouwen.
       *
       * site_order_toekennen schrijft eerst een regel in site_orderboek met
       * (shop, order_id) als sleutel. Bestaat die al, dan gebeurt er niets
       * meer. Zo is deze webhook idempotent en blijft er een spoor van welke
       * orders geteld zijn.
       */
      await supabase.rpc("site_order_toekennen", {
        p_shop: shop,
        p_order_id: Number((payload as any)?.id),
        p_sessie: sess,
        p_cents: cents,
      });
    }
  } catch {
    // Een mislukte koppeling mag de rest van deze webhook niet meenemen.
  }

  try {
    const { data: tests } = await supabase
      .from("price_tests")
      .select("id, control_product_id, test_product_id")
      .eq("shop", shop)
      .in("status", ["running", "stopped"]);

    if (!tests?.length) return new Response(null, { status: 200 });

    const num = (gid: string) => String(gid).split("/").pop();
    const lineItems: any[] = (payload as any)?.line_items || [];

    for (const t of tests) {
      const controlNum = num(t.control_product_id);
      const testNum = num(t.test_product_id);

      let cents = 0;
      let units = 0;
      let lines = 0;
      let subscription = false;
      let variantId: string | null = null;
      let variantTitle: string | null = null;
      let cohort: "control" | "test" | null = null;

      for (const li of lineItems) {
        const pid = String(li?.product_id);
        const isControl = pid === controlNum;
        const isTest = pid === testNum;
        if (!isControl && !isTest) continue;

        // An order containing both products belongs to neither group: there is
        // no telling which price drove the behaviour. Skipping is more honest
        // than guessing.
        const thisGroup = isTest ? "test" : "control";
        if (cohort && cohort !== thisGroup) {
          cohort = null;
          break;
        }
        cohort = thisGroup;

        const qty = Number(li?.quantity) || 0;

        // What the customer actually paid: price minus allocated discounts, so
        // the bundle discount is already reflected.
        const gross = Math.round(parseFloat(li?.price || "0") * 100) * qty;
        const discount = ((li?.discount_allocations || []) as any[]).reduce(
          (a, d) => a + Math.round(parseFloat(d?.amount || "0") * 100),
          0,
        );
        cents += Math.max(0, gross - discount);
        units += qty;
        lines += 1;

        // A selling plan on any line makes this a subscription order. Shopify
        // puts it on the line, not the order, because a cart can mix both.
        if (li?.selling_plan_allocation?.selling_plan?.id) subscription = true;

        // First matching line decides the variant shown in the breakdown.
        // Multiple lines of the same product are rare here and would only
        // muddy that column.
        if (!variantId) {
          variantId = li?.variant_id ? String(li.variant_id) : null;
          variantTitle = li?.variant_title || li?.title || null;
        }
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
          is_subscription: subscription,
          units,
          line_count: lines,
          variant_id: variantId,
          variant_title: variantTitle,
        },
        { onConflict: "shop,order_id", ignoreDuplicates: true },
      );
    }
  } catch (_e) {
    // Never return a non-200: Shopify would keep retrying and that only
    // produces more duplicate rows. The order is placed; nothing here is
    // recoverable.
  }

  return new Response(null, { status: 200 });
};
