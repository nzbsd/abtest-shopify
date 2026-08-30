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
    const bezoeker = attrsAlle["_pt_visitor"];
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
    } else if (bezoeker && bron === "web") {
      /**
       * Geen sessie-kenmerk, wel een bezoekers-id.
       *
       * De winkelwagen kan vervangen zijn tussen het bezoek en de bestelling,
       * of het snippet kwam niet aan bod. Dan is de sessie nog te herleiden via
       * de bezoeker: dezelfde persoon, laatste sessie die vóór de bestelling
       * begon, binnen een halfuur.
       *
       * Op 26 augustus was dit zeventien van de vijfentwintig orders die anders
       * nergens meetelden - van tweeënzestig naar negenenzeventig op een dag.
       *
       * Alleen binnen dat halfuur. Verder terug wordt het gokken, en een order
       * aan de verkeerde sessie hangen is erger dan hem niet toekennen: dan
       * staat er een conversie op een bezoek dat hem niet heeft opgeleverd.
       */
      const cents = Math.round(parseFloat((payload as any)?.total_price || "0") * 100);
      await supabase.rpc("site_order_via_bezoeker", {
        p_shop: shop,
        p_order_id: Number((payload as any)?.id),
        p_bezoeker: bezoeker,
        p_cents: cents,
        p_besteld: (payload as any)?.created_at || new Date().toISOString(),
      });
    }
  } catch {
    // Een mislukte koppeling mag de rest van deze webhook niet meenemen.
  }

  try {
    const { data: alleTests } = await supabase
      .from("price_tests")
      .select("id, control_product_id, test_product_id, started_at, stopped_at")
      .eq("shop", shop)
      .in("status", ["running", "stopped"]);

    if (!alleTests?.length) return new Response(null, { status: 200 });

    /**
     * Alleen tests die liepen toen er besteld werd.
     *
     * Gestopte tests stonden hier bewust bij: hun bestellingen komen soms pas
     * na het stoppen binnen, en die horen er nog bij. Maar er werd niet gekeken
     * WANNEER de bestelling geplaatst is, dus een gestopte test bleef ook alle
     * latere bestellingen opeisen.
     *
     * Test 2 stopte op 26 augustus en legde de dag erna negenendertig
     * bestellingen vast - bestellingen van bezoekers die zijn pagina nooit
     * gezien hadden. Erger nog: zolang de idempotentie-sleutel geen test_id
     * kende, blokkeerde dat de test die wel liep.
     */
    const besteldOp = Date.parse((payload as any)?.created_at || "") || Date.now();
    const tests = alleTests.filter((t: any) => {
      const start = Date.parse(t.started_at || "");
      if (Number.isFinite(start) && besteldOp < start) return false;
      const stop = Date.parse(t.stopped_at || "");
      if (Number.isFinite(stop) && besteldOp > stop) return false;
      return true;
    });

    if (!tests.length) return new Response(null, { status: 200 });

    const num = (gid: string) => String(gid).split("/").pop();
    const lineItems: any[] = (payload as any)?.line_items || [];

    const attrs: Record<string, string> = {};
    for (const a of (payload as any)?.note_attributes || []) {
      if (a?.name) attrs[String(a.name)] = String(a.value ?? "");
    }

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

      /**
       * Bij een template-, url- of themetest verkopen beide armen hetzelfde
       * product. Er is dan geen test_product_id, dus de vergelijking hierboven
       * kan de armen niet uit elkaar houden: elke orderregel matcht control en
       * iedere bestelling zou in die groep belanden. Het resultaat zou er
       * kloppend uitzien en volledig onjuist zijn.
       *
       * Het thema kent het cohort wel en schrijft het mee op de winkelwagen als
       * _pt_<testId>. Dat is hier de enige bron die klopt, want die zegt wat de
       * bezoeker daadwerkelijk te zien heeft gekregen.
       */
      if (!t.test_product_id) {
        const gemeld = attrs["_pt_" + t.id];
        cohort = gemeld === "control" || gemeld === "test" ? gemeld : null;
      }

      /**
       * Staat het kenmerk er niet, dan de bezoeker opzoeken.
       *
       * Het thema schrijft het cohort op de winkelwagen, maar dat kan misgaan -
       * en dat is ook gebeurd: een ontbrekende backslash in de cookie-regex van
       * cartToken zorgde ervoor dat tagCart een sessie lang maar één keer
       * schreef, en dat was de aanroep die het cohort nog niet kende. Van de
       * eerste vijfendertig orders van de paginatest droeg er één het kenmerk.
       *
       * De bezoeker liet wel een view-gebeurtenis achter, en daar staat zijn
       * cohort in. Dat is geen gok maar dezelfde toewijzing, en het scheelt het
       * verschil tussen een order die meetelt en een die verdwijnt.
       *
       * Dit stond al in het resultatenscherm. Het hoort ook hier, want sinds
       * dat scherm zijn cijfers uit deze tabel leest is een order die de
       * webhook overslaat een order die nergens meer opduikt.
       */
      if (!cohort) {
        const bezoeker = attrs["_pt_visitor"];
        if (bezoeker) {
          const { data: gezien } = await supabase
            .from("price_test_events")
            .select("cohort")
            .eq("shop", shop)
            .eq("test_id", t.id)
            .eq("event_type", "view")
            .eq("visitor_id", bezoeker)
            .limit(1);
          const c = gezien?.[0]?.cohort;
          if (c === "control" || c === "test") cohort = c;
        }
      }

      if (!cohort) continue;

      await supabase.from("price_test_events").upsert(
        {
          shop,
          test_id: t.id,
          cohort,
          event_type: "purchase",
          // Zonder test_product_id draaien beide armen op hetzelfde product, en
          // die kolom staat op NOT NULL: zonder deze terugval zou elke order in
          // de testarm van een template-test alsnog stuklopen.
          product_id:
            cohort === "test"
              ? t.test_product_id || t.control_product_id
              : t.control_product_id,
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
        // Per test, niet per winkel: een bezoeker kan in meer dan een test
        // tegelijk zitten en dan hoort elke test zijn eigen regel te krijgen.
        // Met (shop, order_id) claimde de eerste test de bestelling en kwamen
        // de andere nooit aan bod.
        { onConflict: "shop,test_id,order_id", ignoreDuplicates: true },
      );
    }
  } catch (e: any) {
    /**
     * Never return a non-200: Shopify would keep retrying and that only
     * produces more duplicate rows. The order is placed; nothing here is
     * recoverable.
     *
     * MAAR WEL LOGGEN, en dat ontbrak. Deze catch heeft een echte fout
     * dagenlang onzichtbaar gehouden: product_id stond op NOT NULL, een
     * kassatest heeft geen product, dus elke toegewezen order sloeg hier stuk
     * en verdween zonder spoor. Het scherm zei nul aankopen, de orders droegen
     * gewoon hun cohort, en er was nergens iets te zien dat ergens op wees.
     *
     * Stil doorgaan is hier het juiste gedrag; stil verdwijnen niet.
     */
    console.error("orders/create", shop, (payload as any)?.id, e?.message ?? e);
  }

  return new Response(null, { status: 200 });
};
