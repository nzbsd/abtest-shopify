import { createCookieSessionStorage, redirect } from "@remix-run/node";
import crypto from "node:crypto";
import supabase from "~/db.server";

/**
 * Toegang tot het eigen dashboard.
 *
 * Dit dashboard staat op een publieke URL, buiten de Shopify-admin. Er is dus
 * geen Shopify-sessie die de toegang regelt en moet het zelf op slot.
 *
 * Bewust FAIL-CLOSED: staat DASHBOARD_PASSWORD niet ingesteld, dan komt
 * niemand binnen. Andersom - open zolang er geen wachtwoord is - zou betekenen
 * dat een vergeten env-variabele je omzetcijfers en je testinstellingen aan de
 * hele wereld geeft, zonder dat iets dat laat merken.
 */

const SECRET = process.env.SESSION_SECRET || process.env.SHOPIFY_API_SECRET || "";

export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "_pt_dash",
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secrets: SECRET ? [SECRET] : ["insecure-dev-only"],
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 14,
  },
});

/** Vergelijking in vaste tijd, zodat het antwoord niets over het wachtwoord verraadt. */
function gelijk(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    // Nog steeds een vergelijking uitvoeren zodat de duur niet de lengte prijsgeeft.
    crypto.timingSafeEqual(ab, ab);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

export function wachtwoordKlopt(ingevoerd: string): boolean {
  const juist = process.env.DASHBOARD_PASSWORD || "";
  if (!juist) return false;
  return gelijk(ingevoerd, juist);
}

export async function isIngelogd(request: Request): Promise<boolean> {
  const s = await sessionStorage.getSession(request.headers.get("Cookie"));
  return s.get("ok") === true;
}

export async function vereisLogin(request: Request): Promise<void> {
  if (await isIngelogd(request)) return;
  const url = new URL(request.url);
  throw redirect("/dashboard/login?next=" + encodeURIComponent(url.pathname));
}

export async function maakSessie(next: string) {
  const s = await sessionStorage.getSession();
  s.set("ok", true);
  return redirect(next || "/dashboard", {
    headers: { "Set-Cookie": await sessionStorage.commitSession(s) },
  });
}

export async function verbreekSessie(request: Request) {
  const s = await sessionStorage.getSession(request.headers.get("Cookie"));
  return redirect("/dashboard/login", {
    headers: { "Set-Cookie": await sessionStorage.destroySession(s) },
  });
}

/**
 * Het winkeldomein waarvoor we de Admin API aanroepen.
 *
 * Dit dashboard hoort niet bij een ingelogde Shopify-gebruiker, dus we leiden
 * de winkel af uit de opgeslagen offline sessie. SHOP_DOMAIN in de omgeving
 * gaat voor, zodat je hem kunt vastzetten als er ooit meerdere installaties
 * in dezelfde database staan.
 */
export async function winkelDomein(): Promise<string | null> {
  if (process.env.SHOP_DOMAIN) return process.env.SHOP_DOMAIN;
  const { data } = await supabase
    .from("price_test_sessions")
    .select("shop")
    .limit(1)
    .maybeSingle();
  return data?.shop ?? null;
}
