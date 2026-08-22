import { redirect, type LoaderFunctionArgs } from "@remix-run/node";

/*
 * De root wordt door twee heel verschillende bezoekers opgevraagd.
 *
 * Shopify opent de app op de App-URL, dus op deze route, met shop/host/embedded
 * in de queryparameters. Die hoort naar /app te gaan, waar de ingebedde pagina
 * met de dashboardknop staat.
 *
 * Iemand die zelf de URL intypt hoort naar /dashboard te gaan.
 *
 * Eerder ging alles naar /dashboard, en dan kreeg je binnen de Shopify-admin
 * het wachtwoordscherm te zien in plaats van de knop - de ingebedde pagina werd
 * simpelweg nooit bereikt.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const vanShopify =
    url.searchParams.has("shop") ||
    url.searchParams.has("host") ||
    url.searchParams.has("embedded") ||
    url.searchParams.has("id_token");

  if (vanShopify) throw redirect("/app?" + url.searchParams.toString());
  throw redirect("/dashboard");
};
