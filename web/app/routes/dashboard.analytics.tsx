import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { AnalyticsView } from "~/views/analytics";
import { Banner } from "~/components/ui";
import { vereisLogin, winkelDomein } from "~/lib/dashboardAuth.server";
import { analyticsData } from "~/lib/pageData.server";
import { adminVoorShop } from "~/lib/adminVoorShop.server";

export const meta = () => [{ title: "Analytics · Experli" }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await vereisLogin(request);
  const shop = await winkelDomein();
  return json(await analyticsData(await adminVoorShop(shop), shop));
};

export default function Route() {
  const d = useLoaderData<typeof loader>();
  if (d.fout) {
    return (
      <main className="page">
        <h1 className="page__title" style={{ marginBottom: 20 }}>Analytics</h1>
        <Banner tone="error">
          <strong>Configuration incomplete.</strong>
          <div style={{ marginTop: 6 }}><code>{d.fout}</code></div>
        </Banner>
      </main>
    );
  }
  return <AnalyticsView tests={d.tests} stats={d.stats} daily={d.daily} orders={d.orders} />;
}
