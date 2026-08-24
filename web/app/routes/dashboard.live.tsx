import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { vereisLogin, winkelDomein } from "~/lib/dashboardAuth.server";
import { liveData } from "~/lib/live.server";

/** Zelfde gegevens als app.live, andere deur. */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await vereisLogin(request);
  const shop = await winkelDomein();
  if (!shop) return json({ nu: 0, landen: [], orders: [], winkelLand: null, op: new Date().toISOString() });

  const sinds = new URL(request.url).searchParams.get("sinds");
  return json(await liveData(shop, sinds), { headers: { "Cache-Control": "no-store" } });
};
