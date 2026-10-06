import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "~/shopify.server";
import { testLiveData } from "~/lib/testLive.server";
import { TestLiveView } from "~/views/testlive";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return json(await testLiveData(session.shop));
};

export default function Route() {
  const d = useLoaderData<typeof loader>();
  return <TestLiveView begin={d} basis="/app" />;
}
