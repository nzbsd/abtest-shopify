import { type LoaderFunctionArgs } from "@remix-run/node";

/**
 * De wortel.
 *
 * Shopify opent de app op deze URL, met shop/host/embedded/id_token in de
 * queryparameters. Die gaan door naar /app, waar authenticate.admin het
 * overneemt.
 *
 * Alle andere bezoekers krijgen niets. Er was hier een tweede ingang - een
 * eigen dashboard met een wachtwoord - en die is weg: deze app draait alleen
 * binnen de Shopify-admin. Geen doorverwijzing naar een inlogscherm, want dan
 * verraadt de app aan iedereen die de URL intypt dat er iets te halen valt en
 * hoe het heet.
 */
export const loader = ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const vanShopify =
    url.searchParams.has("shop") ||
    url.searchParams.has("host") ||
    url.searchParams.has("embedded") ||
    url.searchParams.has("id_token");

  if (vanShopify) {
    return new Response(null, {
      status: 302,
      headers: { Location: "/app?" + url.searchParams.toString() },
    });
  }

  return new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
  });
};
