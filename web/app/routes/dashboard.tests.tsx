import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { TestsView } from "~/views/tests";
import { unauthenticated } from "~/shopify.server";
import { vereisLogin, winkelDomein } from "~/lib/dashboardAuth.server";
import { testsAction, testsData } from "~/lib/pageData.server";

export const meta = () => [{ title: "Tests · Price Test" }];

/*
 * Het losse dashboard heeft geen Shopify-sessie van een ingelogde beheerder,
 * dus praat het met de Admin API via de opgeslagen offline sessie. Lukt dat
 * niet, dan blijft het scherm werken zonder productenlijst - je kunt dan geen
 * nieuwe test aanmaken maar wel een lopende stoppen.
 */
async function adminOfNiets(shop: string | null) {
  if (!shop) return null;
  try {
    const { admin } = await unauthenticated.admin(shop);
    return admin;
  } catch {
    return null;
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await vereisLogin(request);
  const shop = await winkelDomein();
  return json(await testsData(await adminOfNiets(shop), shop));
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await vereisLogin(request);
  const shop = await winkelDomein();
  const form = await request.formData();
  return json(await testsAction(await adminOfNiets(shop), shop, form));
};

export default function Route() {
  const d = useLoaderData<typeof loader>();
  return <TestsView tests={d.tests} producten={d.producten} fout={d.fout} winkelUrl={d.winkelUrl} basis="/dashboard" />;
}
