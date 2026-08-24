import { type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import supabase from "~/db.server";
import { magNog, ipVan } from "~/lib/rateLimit.server";

/**
 * Meetpunt voor de sitewide analytics.
 *
 * Aparte route van het A/B-meetpunt, want het zijn andere vragen met andere
 * volumes: dit vuurt op élke pagina van de winkel, dat alleen op een pagina
 * die in een test zit.
 *
 * ÉÉN RIJ PER SESSIE, BIJGEWERKT
 * Elke pageview is een upsert op session_id die de tellers ophoogt in plaats
 * van een rij toe te voegen. Een bezoek van acht pagina's is daarmee één rij,
 * niet zestien. Dat scheelt niet alleen ruimte - alles wat je wilt weten gaat
 * over de sessie, dus het staat meteen in de goede vorm.
 *
 * text/plain, net als het andere meetpunt: sendBeacon kan geen CORS-preflight
 * doen, dus application/json wordt door de browser stil weggegooid.
 */

const PER_IP_PER_MIN = 120;      // een snelle browser doet er makkelijk 20
const PER_SHOP_PER_DAG = 500_000;

const headers = new Headers({
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
});

/** Remix stuurt OPTIONS naar de loader, niet naar de action. */
export const loader = async ({ request }: LoaderFunctionArgs) =>
  new Response(null, { status: request.method === "OPTIONS" ? 204 : 405, headers });

/**
 * Padnormalisatie.
 *
 * Checkout-URL's dragen een token per sessie (/checkouts/c/abc123...), en
 * ongenormaliseerd levert elke bezoeker daar zijn eigen rij op in de
 * padtabel. Hetzelfde geldt voor paginering en varianten. Op een winkel met
 * duizenden sessies is dat het verschil tussen twintig rijen en twintigduizend.
 */
function normaliseerPad(ruw: string): string {
  let p = String(ruw || "/").split("?")[0].split("#")[0];
  p = p.replace(/\/+$/, "") || "/";
  if (p.startsWith("/checkouts")) return "/checkouts/";
  if (p.startsWith("/account")) return "/account/";
  if (/^\/[a-z]{2}(-[a-z]{2})?\//i.test(p)) p = p.replace(/^\/[a-z]{2}(-[a-z]{2})?/i, "");
  return p.slice(0, 200) || "/";
}

/** Alleen de host van de verwijzer, en de eigen winkel telt niet mee. */
function verwijzerHost(ruw: string, shop: string): string | null {
  if (!ruw) return null;
  try {
    const h = new URL(ruw).hostname.replace(/^www\./, "");
    if (!h || h === shop.replace(/^www\./, "")) return null;
    return h.slice(0, 100);
  } catch { return null; }
}

const kort = (v: unknown, n: number) =>
  v === undefined || v === null || v === "" ? null : String(v).slice(0, n);

export const action = async ({ request }: ActionFunctionArgs) => {
  try {
    const body = JSON.parse(await request.text());

    const shop = String(body?.shop || "");
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) {
      return new Response(JSON.stringify({ ok: false }), { status: 400, headers });
    }

    const sessie = kort(body?.sid, 64);
    const bezoeker = kort(body?.vid, 64);
    if (!sessie || !bezoeker) {
      return new Response(JSON.stringify({ ok: false }), { status: 400, headers });
    }

    if (!magNog("site:" + ipVan(request), PER_IP_PER_MIN, 60_000)) {
      return new Response(JSON.stringify({ ok: false }), { status: 429, headers });
    }
    if (!magNog("site-dag:" + shop, PER_SHOP_PER_DAG, 86_400_000)) {
      return new Response(JSON.stringify({ ok: false }), { status: 429, headers });
    }

    const pad = normaliseerPad(String(body?.path || "/"));
    const nu = new Date().toISOString();

    // Gedragssignalen: toevoegen aan de cart en naar de kassa gaan. Die zijn
    // op dit thema niet uit de URL te zien - de cart is een drawer en de kassa
    // rendert het thema niet - dus ze komen als eigen signaal binnen.
    // De kassastappen komen van de web pixel, de eerste twee ook van het
    // thema. Dezelfde ingang, dezelfde RPC: het is één sessie.
    if (["atc", "checkout", "atc_px", "checkout_px",
         "contact", "verzending", "betaling", "afgerekend"]
          .includes(String(body?.t))) {
      await supabase.rpc("site_signaal", {
        p_sessie: sessie, p_soort: String(body.t), p_nu: nu,
      });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    }

    if (body?.t === "leave") {
      // Vertrek: alleen betrokkenheid bijwerken. Geen pageview erbij, anders
      // telt elke pagina dubbel.
      const duur = Math.max(0, Math.min(1_800_000, Number(body?.ms) || 0));
      const scroll = Math.max(0, Math.min(100, Number(body?.scroll) || 0));
      await supabase.rpc("site_vertrek", {
        p_sessie: sessie, p_duur: duur, p_scroll: scroll, p_pad: pad, p_nu: nu,
      });
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    }

    await supabase.rpc("site_pageview", {
      p_sessie: sessie,
      p_shop: shop,
      p_bezoeker: bezoeker,
      p_pad: pad,
      p_verwijzer: verwijzerHost(String(body?.ref || ""), shop),
      p_utm_source: kort(body?.us, 60),
      p_utm_medium: kort(body?.um, 60),
      p_utm_campaign: kort(body?.uc, 80),
      p_land: kort(body?.country, 4),
      p_device: ["mobile", "tablet", "desktop"].includes(String(body?.device))
        ? String(body.device) : "unknown",
      p_nieuw: Boolean(body?.new),
      p_nu: nu,
      p_browser: kort(body?.browser, 40),
      p_os: kort(body?.os, 40),
      p_taal: kort(body?.taal, 8),
      p_scherm: kort(body?.scherm, 20),
    });

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  } catch {
    // Stil falen: een mislukte meting mag de winkel nooit ophouden.
    return new Response(JSON.stringify({ ok: false }), { status: 200, headers });
  }
};
