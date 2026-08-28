import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { TestsView } from "~/views/tests";
import { authenticate } from "~/shopify.server";
import { testsAction, testsData } from "~/lib/pageData.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  return json(await testsData(admin, session.shop));
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  return json(await testsAction(admin, session.shop, form));
};

export default function Route() {
  const d = useLoaderData<typeof loader>();
  return <TestsView tests={d.tests} producten={d.producten} templates={d.templates} themas={d.themas} fout={d.fout} winkelUrl={d.winkelUrl} shop={d.shop} daily={d.daily} basis="/app" />;
}
