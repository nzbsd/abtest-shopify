import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import supabase from "~/db.server";

/**
 * De drie verplichte privacy-webhooks van Shopify (AVG/GDPR).
 *
 * Wat deze app over een klant weet, hangt aan het bezoekers-id. Voor een
 * ingelogde klant is dat "c" + klantnummer (thema-snippet); voor een anonieme
 * bezoeker een willekeurige string die niet naar een persoon terug te leiden
 * is. Alleen de eerste soort valt dus te vinden en te wissen.
 *
 * - customers/data_request: er is niets op te sturen behalve gedragsgegevens
 *   zonder naam of adres. Gelogd, zodat het verzoek te volgen is.
 * - customers/redact: de rijen van die klant weg.
 * - shop/redact: 48 uur na de-installatie, alles van de winkel weg.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  try {
    if (topic === "CUSTOMERS_DATA_REQUEST") {
      console.log("customers/data_request", shop, (payload as any)?.customer?.id);
    }

    if (topic === "CUSTOMERS_REDACT") {
      const id = (payload as any)?.customer?.id;
      if (id) {
        const bezoeker = "c" + String(id);
        await supabase.from("price_test_events").delete().eq("shop", shop).eq("visitor_id", bezoeker);
        await supabase.from("site_sessies").delete().eq("shop", shop).eq("visitor_id", bezoeker);
      }
    }

    if (topic === "SHOP_REDACT") {
      await supabase.from("price_test_events").delete().eq("shop", shop);
      await supabase.from("price_tests").delete().eq("shop", shop);
      await supabase.from("site_sessies").delete().eq("shop", shop);
      await supabase.from("site_winkel").delete().eq("shop", shop);
      await supabase.from("price_test_sessions").delete().eq("shop", shop);
    }
  } catch (e: any) {
    console.error("compliance", topic, shop, e?.message ?? e);
  }

  return new Response();
};
