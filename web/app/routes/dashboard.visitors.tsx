import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { SiteView } from "~/views/site";
import { Banner } from "~/components/ui";
import { vereisLogin, winkelDomein } from "~/lib/dashboardAuth.server";
import { siteData, type SiteBereik } from "~/lib/site.server";

export const meta = () => [{ title: "Visitors · Experli" }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await vereisLogin(request);
  const shop = await winkelDomein();
  if (!shop) return json({ shop: null, data: null });

  const d = new URL(request.url).searchParams.get("d");
  const bereik = (["1", "7", "30", "90"].includes(String(d)) ? d : "7") as SiteBereik;
  return json({ shop, data: await siteData(shop, bereik) });
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
  return <SiteView data={d.data} shop={d.shop} />;
}
