import { type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import supabase from "~/db.server";
import { ipVan, magNog } from "~/lib/rateLimit.server";

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

/**
 * The CORS preflight.
 *
 * This has to be a loader, not part of the action. Remix only routes
 * POST/PUT/PATCH/DELETE to an action; an OPTIONS request is treated as a read
 * and goes to the loader. With no loader exported it produced a 400, the
 * preflight failed, and the browser silently dropped every beacon the theme
 * sent — which is exactly what happened here: the endpoint answered POSTs
 * perfectly while nothing ever arrived from the storefront.
 *
 * Answering the preflight properly means the theme can post application/json
 * without needing any change on its side.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: CORS,
  });
};

/**
 * Meetpunt voor het thema: view en add-to-cart.
 *
 * Publiek endpoint zonder auth — het thema kan geen admin-sessie meesturen.
 * Daarom bewust minimaal: we accepteren alleen de velden hieronder, valideren
 * de shop, en schrijven niets wat een aanvaller kan gebruiken om de uitslag te
 * sturen behalve ruis toevoegen. Omzet komt NIET hier vandaan maar uit de
 * orders/create-webhook, die wél door Shopify is ondertekend.
 */
/* ── limits ──────────────────────────────────────────────────────────────
   Chosen against what a real storefront produces. A visitor browsing hard
   generates a handful of events a minute; 30 leaves room for that and still
   stops a script. The daily cap is the ceiling that actually bounds damage:
   this table lives in the database shared with the popup and bundle app, so a
   flood here would take those down too.
   ───────────────────────────────────────────────────────────────────────── */
const PER_IP_PER_MIN = 30;
const PER_VISITOR_PER_MIN = 15;
const PER_SHOP_PER_DAG = 200_000;

/* Running test ids per shop, briefly cached. Without this every event costs a
   database round trip, and an attacker could make the database the bottleneck
   simply by sending nonsense. */
const testCache = new Map<string, { at: number; ids: Set<number> }>();
const TEST_CACHE_MS = 60_000;

async function lopendeTests(shop: string): Promise<Set<number>> {
  const hit = testCache.get(shop);
  if (hit && Date.now() - hit.at < TEST_CACHE_MS) return hit.ids;

  const { data } = await supabase
    .from("price_tests")
    .select("id")
    .eq("shop", shop)
    .eq("status", "running");

  const ids = new Set<number>((data || []).map((r: any) => Number(r.id)));
  testCache.set(shop, { at: Date.now(), ids });
  return ids;
}

/* Daily volume per shop, cached for a minute. Bounds the damage of a flood to
   the cap plus at most one minute of writes. */
const dagCache = new Map<string, { at: number; n: number }>();

async function aantalDezeDag(shop: string): Promise<number> {
  const hit = dagCache.get(shop);
  if (hit && Date.now() - hit.at < 60_000) return hit.n;

  const sinds = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await supabase
    .from("price_test_events")
    .select("id", { count: "exact", head: true })
    .eq("shop", shop)
    .gte("created_at", sinds);

  const n = Number(count) || 0;
  dagCache.set(shop, { at: Date.now(), n });
  return n;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const headers = new Headers(CORS);
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  try {
    const ip = ipVan(request);
    if (!magNog("ev:ip:" + ip, PER_IP_PER_MIN, 60_000)) {
      return new Response(JSON.stringify({ ok: false }), { status: 429, headers });
    }

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
    if (!["view", "atc", "checkout"].includes(eventType)) throw new Error("bad event");
    if (!Number.isFinite(testId)) throw new Error("bad test");

    const visitorId = body?.visitorId ? String(body.visitorId).slice(0, 64) : null;
    if (visitorId && !magNog("ev:v:" + visitorId, PER_VISITOR_PER_MIN, 60_000)) {
      return new Response(JSON.stringify({ ok: false }), { status: 429, headers });
    }

    // The test has to exist AND be running for this shop. Without this anyone
    // could write rows against any test id, or against a shop that has none.
    const lopend = await lopendeTests(shop);
    if (!lopend.has(testId)) throw new Error("unknown or inactive test");

    if ((await aantalDezeDag(shop)) >= PER_SHOP_PER_DAG) {
      return new Response(JSON.stringify({ ok: false }), { status: 429, headers });
    }

    await supabase.from("price_test_events").insert({
      shop,
      test_id: testId,
      cohort,
      event_type: eventType,
      product_id: String(body?.productId ?? ""),
      market: body?.market ? String(body.market) : null,
      currency: body?.currency ? String(body.currency) : null,
      // Afgedwongen op een vaste lijst, want dit veld komt uit de browser en
      // gaat ongefilterd een groepering in. Alles wat er niet in past wordt
      // "unknown" in plaats van een eigen kolomwaarde in de uitsplitsing.
      device: ["mobile", "tablet", "desktop"].includes(String(body?.device))
        ? String(body.device)
        : "unknown",
      visitor_id: visitorId,
    });

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch (_e) {
    // Stil falen: een mislukte meting mag de storefront nooit ophouden.
    return new Response(JSON.stringify({ ok: false }), { status: 200, headers });
  }
};
