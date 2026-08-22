import { type ActionFunctionArgs } from "@remix-run/node";
import supabase from "~/db.server";

/**
 * Meetpunt voor het thema: view en add-to-cart.
 *
 * Publiek endpoint zonder auth — het thema kan geen admin-sessie meesturen.
 * Daarom bewust minimaal: we accepteren alleen de velden hieronder, valideren
 * de shop, en schrijven niets wat een aanvaller kan gebruiken om de uitslag te
 * sturen behalve ruis toevoegen. Omzet komt NIET hier vandaan maar uit de
 * orders/create-webhook, die wél door Shopify is ondertekend.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  try {
    const body: any = await request.json();
    const shop = String(body?.shop || "");
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) {
      return new Response(JSON.stringify({ error: "Invalid shop" }), { status: 400, headers });
    }

    const cohort = String(body?.cohort || "");
    const eventType = String(body?.eventType || "");
    const testId = Number(body?.testId);
    if (!["control", "test"].includes(cohort)) throw new Error("bad cohort");
    // 'purchase' hoort hier niet: die komt uit de ondertekende webhook. Wie
    // hem hier zou proberen te sturen, kan de omzetcijfers vervuilen.
    if (!["view", "atc"].includes(eventType)) throw new Error("bad event");
    if (!Number.isFinite(testId)) throw new Error("bad test");

    await supabase.from("price_test_events").insert({
      shop,
      test_id: testId,
      cohort,
      event_type: eventType,
      product_id: String(body?.productId ?? ""),
      market: body?.market ? String(body.market) : null,
      currency: body?.currency ? String(body.currency) : null,
      visitor_id: body?.visitorId ? String(body.visitorId).slice(0, 64) : null,
    });

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (_e) {
    // Stil falen: een mislukte meting mag de storefront nooit ophouden.
    return new Response(JSON.stringify({ ok: false }), { status: 200, headers });
  }
};
