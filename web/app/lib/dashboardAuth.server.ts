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

/*
 * Inloggen vanuit de Shopify-admin.
 *
 * Wie de app in Shopify open heeft, is door Shopify al geïdentificeerd als
 * beheerder van deze winkel. Die persoon nog een apart wachtwoord laten intypen
 * voegt geen zekerheid toe - het maakt de toegang juist zwakker, want een
 * wachtwoord wordt gedeeld en blijft geldig nadat iemand uit je Shopify-team is
 * verwijderd. Daarom geeft de ingebedde app een kortlevend ondertekend kaartje
 * mee waarmee het dashboard een sessie aanmaakt.
 *
 * Vijf minuten geldig: lang genoeg om erop te klikken, kort genoeg dat een
 * gelekte URL uit je browsergeschiedenis niets meer waard is.
 */
const SSO_GELDIG_MS = 5 * 60 * 1000;

function ondertekenen(payload: string): string {
  return crypto.createHmac("sha256", SECRET || "insecure-dev-only").update(payload).digest("hex");
}

export function maakSsoToken(shop: string): string {
  const payload = Buffer.from(
    JSON.stringify({ shop, exp: Date.now() + SSO_GELDIG_MS }),
  ).toString("base64url");
  return payload + "." + ondertekenen(payload);
}

export function ssoTokenGeldig(token: string): boolean {
  const [payload, handtekening] = String(token || "").split(".");
  if (!payload || !handtekening) return false;

  // Eerst de handtekening, dan pas de inhoud lezen: een ongeldig kaartje mag
  // nooit door onze JSON-parser komen.
  const verwacht = ondertekenen(payload);
  if (handtekening.length !== verwacht.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(handtekening), Buffer.from(verwacht))) return false;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof data?.exp === "number" && data.exp > Date.now();
  } catch {
    return false;
  }
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
  try {
    const { data } = await supabase
      .from("price_test_sessions")
      .select("shop")
      .limit(1)
      .maybeSingle();
    return data?.shop ?? null;
  } catch {
    // Ontbreekt de databaseconfiguratie, dan is dat een instelprobleem dat de
    // pagina zelf moet melden. Hier omvallen zou het hele dashboard op een leeg
    // foutscherm zetten, zonder te vertellen wat eraan schort.
    return null;
  }
}

/** Wat er mis is met de configuratie, of null als alles er staat. */
export function configProbleem(): string | null {
  const mist = [
    ["SUPABASE_URL", process.env.SUPABASE_URL],
    ["SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY],
    ["SHOPIFY_API_KEY", process.env.SHOPIFY_API_KEY],
    ["SHOPIFY_API_SECRET", process.env.SHOPIFY_API_SECRET],
    ["SHOPIFY_APP_URL", process.env.SHOPIFY_APP_URL],
  ]
    .filter(([, waarde]) => !waarde)
    .map(([naam]) => naam as string);

  return mist.length ? "Ontbrekende omgevingsvariabelen: " + mist.join(", ") : null;
}
