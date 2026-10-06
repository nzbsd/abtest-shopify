import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { testLiveData } from "~/lib/testLive.server";

/** De verse cijfers voor het A/B-live-scherm, elke tien seconden opgehaald. */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return json(await testLiveData(session.shop), {
    headers: { "Cache-Control": "no-store" },
  });
};
