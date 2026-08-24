import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { SiteView } from "~/views/site";
import { Banner } from "~/components/ui";
import { vereisLogin, winkelDomein } from "~/lib/dashboardAuth.server";
import { siteData, type SiteBereik, type Vergelijking } from "~/lib/site.server";
import { leesFilters } from "~/lib/siteFilters";

export const meta = () => [{ title: "Visitors · Experli" }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await vereisLogin(request);
  const shop = await winkelDomein();
  if (!shop) return json({ data: null, filters: [] });

  const p = new URL(request.url).searchParams;
  const d = p.get("d");
  // Vandaag als standaard: dit is de voordeur van de app, en de vraag bij het
  // openen is "wat gebeurt er nu", niet "hoe ging de afgelopen week".
  const bereik = (["1", "7", "30", "90"].includes(String(d)) ? d : "1") as SiteBereik;
  const vergelijking = (p.get("v") === "jaar" ? "jaar" : "vorige") as Vergelijking;
  const filters = leesFilters(p.get("f"));

  return json({ data: await siteData(shop, bereik, filters, vergelijking), filters });
};

export default function Route() {
  const d = useLoaderData<typeof loader>();
  if (!d.data) {
    return (
      <main className="page">
        <h1 className="page__title" style={{ marginBottom: 20 }}>Visitors</h1>
        <Banner tone="error">
          <strong>No store connected.</strong> Install the app on your Shopify store first.
        </Banner>
      </main>
    );
  }
  return <SiteView data={d.data} filters={d.filters} basis="/dashboard" />;
}
