import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { OverviewView } from "~/views/overview";
import { Banner } from "~/components/ui";
import { vereisLogin, winkelDomein } from "~/lib/dashboardAuth.server";
import { overzichtData } from "~/lib/pageData.server";
import { adminVoorShop } from "~/lib/adminVoorShop.server";

export const meta = () => [{ title: "Overview · Experli" }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await vereisLogin(request);
  const shop = await winkelDomein();
  return json(await overzichtData(await adminVoorShop(shop), shop));
};

export default function Route() {
  const d = useLoaderData<typeof loader>();
  if (d.fout) {
    return (
      <main className="page">
        <h1 className="page__title" style={{ marginBottom: 20 }}>Overview</h1>
        <Banner tone="error">
          <strong>Configuration incomplete.</strong>
          <div style={{ marginTop: 6 }}><code>{d.fout}</code></div>
        </Banner>
      </main>
    );
  }
  return <OverviewView tests={d.tests} stats={d.stats} orders={d.orders} basis="/dashboard" />;
}
