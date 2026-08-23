import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { SiteView } from "~/views/site";
import { authenticate } from "~/shopify.server";
import { siteData, type SiteBereik } from "~/lib/site.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const d = new URL(request.url).searchParams.get("d");
  const bereik = (["1", "7", "30", "90"].includes(String(d)) ? d : "7") as SiteBereik;
  return json({ shop: session.shop, data: await siteData(session.shop, bereik) });
};

export default function Route() {
  const d = useLoaderData<typeof loader>();
  return <SiteView data={d.data} shop={d.shop} />;
}
