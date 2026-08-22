import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import { maakSsoToken } from "~/lib/dashboardAuth.server";

/*
 * De ingebedde kant is een doorgeefluik naar het eigen dashboard.
 *
 * Shopify heeft de bezoeker hier al geidentificeerd als beheerder van deze
 * winkel. Op basis daarvan maken we een kortlevend kaartje waarmee het
 * dashboard een sessie opent - geen tweede wachtwoord dus. Dat is niet alleen
 * makkelijker maar ook strenger: haal je iemand uit je Shopify-team, dan is
 * zijn toegang tot het dashboard meteen weg. Een gedeeld wachtwoord blijft
 * werken tot iemand eraan denkt het te wijzigen.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const basis = (process.env.SHOPIFY_APP_URL || "").replace(/\/+$/, "");
  return json({ url: basis + "/dashboard/sso?t=" + maakSsoToken(session.shop) });
};

export default function AppIndex() {
  const { url } = useLoaderData<typeof loader>();
  return (
    <main style={{ fontFamily: "system-ui", padding: 32, maxWidth: 560, lineHeight: 1.55 }}>
      <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>Price Test</h2>
      <p style={{ margin: "0 0 20px", color: "#52514e" }}>
        Instellen en cijfers staan op het eigen dashboard, buiten de Shopify-admin.
        Deze knop logt je daar direct in.
      </p>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        style={{
          display: "inline-block", padding: "10px 16px", borderRadius: 10,
          background: "#0b0b0b", color: "#fff", textDecoration: "none", fontWeight: 500,
        }}
      >
        Dashboard openen
      </a>
      <p style={{ margin: "20px 0 0", color: "#86847d", fontSize: 13 }}>
        De link is vijf minuten geldig. Kom je later terug, open dan deze pagina
        opnieuw in plaats van de link te bewaren.
      </p>
    </main>
  );
}
