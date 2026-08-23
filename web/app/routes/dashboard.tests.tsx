import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { TestsView } from "~/views/tests";
import { unauthenticated } from "~/shopify.server";
import { vereisLogin, winkelDomein } from "~/lib/dashboardAuth.server";
import { testsAction, testsData } from "~/lib/pageData.server";
import { adminVoorShop } from "~/lib/adminVoorShop.server";

export const meta = () => [{ title: "Tests · Experli" }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await vereisLogin(request);
  const shop = await winkelDomein();
  return json(await testsData(await adminVoorShop(shop), shop));
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await vereisLogin(request);
  const shop = await winkelDomein();
  const form = await request.formData();
  return json(await testsAction(await adminVoorShop(shop), shop, form));
};

export default function Route() {
  const d = useLoaderData<typeof loader>();
  return <TestsView tests={d.tests} producten={d.producten} fout={d.fout} winkelUrl={d.winkelUrl} basis="/dashboard" />;
}
