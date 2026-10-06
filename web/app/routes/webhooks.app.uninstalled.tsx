import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate, sessionStorage } from "~/shopify.server";
import supabase from "~/db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  if (session) {
    await sessionStorage.deleteSessions([session.id]);
  }

  /**
   * Lopende tests stoppen.
   *
   * Het thema-snippet blijft na het verwijderen gewoon in de <head> staan, en
   * het publieke config-endpoint gaf de lopende tests nog steeds terug. Dan
   * werden bezoekers na de-installatie nog naar een duplicaat doorgestuurd -
   * zonder dat er nog iemand meekeek. Gestopt geeft het endpoint niets meer, en
   * doet het snippet niets.
   */
  try {
    await supabase
      .from("price_tests")
      .update({ status: "stopped", stopped_at: new Date().toISOString() })
      .eq("shop", shop)
      .eq("status", "running");
  } catch (e: any) {
    console.error("app/uninstalled", shop, e?.message ?? e);
  }

  return new Response();
};
