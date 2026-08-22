import { redirect, type LoaderFunctionArgs } from "@remix-run/node";
import { maakSessie, ssoTokenGeldig } from "~/lib/dashboardAuth.server";

/**
 * Binnenkomen vanuit de Shopify-admin.
 *
 * De ingebedde app maakt een kortlevend ondertekend kaartje; hier wordt het
 * ingewisseld voor een dashboard-sessie. Het kaartje blijft in de URL achter,
 * dus we sturen meteen door naar /dashboard zodat het niet in de adresbalk of
 * in een gedeelde link blijft staan.
 *
 * Dit is geen omweg langs de beveiliging maar de bron ervan: alleen wie de app
 * in de Shopify-admin open heeft, krijgt zo'n kaartje, en Shopify heeft die
 * persoon dan al geidentificeerd als beheerder van deze winkel.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const token = new URL(request.url).searchParams.get("t") || "";
  if (!ssoTokenGeldig(token)) {
    // Geen reden meegeven welk deel niet klopte; wie hier verkeerd binnenkomt
    // krijgt gewoon het inlogscherm.
    throw redirect("/dashboard/login");
  }
  return maakSessie("/dashboard");
};
