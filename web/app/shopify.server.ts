import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
  type ShopifyApp,
} from "@shopify/shopify-app-remix/server";
import { SupabaseSessionStorage } from "./lib/sessionStorage.server";

/*
 * Geen billing hier. Dit is een interne app voor een winkel; de billing-config
 * uit de popup-app is bewust niet meegekopieerd, want die verwijst naar een
 * BILLING_ENABLED-schakelaar die in deze app niet bestaat.
 */

let _shopify: ShopifyApp<any> | null = null;
let _initError: Error | null = null;

function normalizeAppUrl(raw: string | undefined): string {
  if (!raw) return "";
  let u = raw.trim();
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return u.replace(/\/+$/, "");
}

/*
 * Lui initialiseren. Ontbreekt een env-variabele, dan faalt alleen het request
 * dat Shopify nodig heeft — niet de hele deploy. Zo blijven /api/price-test en
 * de meet-endpoints bereikbaar terwijl de admin-kant nog niet is ingesteld.
 */
function getShopify(): ShopifyApp<any> {
  if (_shopify) return _shopify;
  if (_initError) throw _initError;
  try {
    _shopify = shopifyApp({
      apiKey: process.env.SHOPIFY_API_KEY!,
      apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
      apiVersion: ApiVersion.January25,
      scopes: process.env.SCOPES ? process.env.SCOPES.split(",").filter(Boolean) : [],
      appUrl: normalizeAppUrl(process.env.SHOPIFY_APP_URL),
      authPathPrefix: "/auth",
      sessionStorage: new SupabaseSessionStorage(),
      distribution: AppDistribution.AppStore,
      future: {
        unstable_newEmbeddedAuthStrategy: true,
      },
    });
    return _shopify;
  } catch (e: any) {
    _initError = e instanceof Error ? e : new Error(String(e));
    throw _initError;
  }
}

const shopify = {
  get addDocumentResponseHeaders() { return getShopify().addDocumentResponseHeaders; },
  get authenticate() { return getShopify().authenticate; },
  get unauthenticated() { return getShopify().unauthenticated; },
  get registerWebhooks() { return getShopify().registerWebhooks; },
  get sessionStorage() { return getShopify().sessionStorage; },
};

export default shopify;
export const apiVersion = ApiVersion.January25;

export function addDocumentResponseHeaders(request: Request, headers: Headers) {
  return getShopify().addDocumentResponseHeaders(request, headers);
}
export const authenticate = new Proxy({} as any, {
  get(_t, prop) { return (getShopify().authenticate as any)[prop]; },
});
export const unauthenticated = new Proxy({} as any, {
  get(_t, prop) { return (getShopify().unauthenticated as any)[prop]; },
});
export function registerWebhooks(opts: any) {
  return getShopify().registerWebhooks(opts);
}
export const sessionStorage = new Proxy({} as any, {
  get(_t, prop) { return (getShopify().sessionStorage as any)[prop]; },
});
