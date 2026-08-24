import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { liveData } from "~/lib/live.server";

/** Het levende deel voor de ingebedde schil. Zie lib/live.server.ts. */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const sinds = new URL(request.url).searchParams.get("sinds");
  return json(await liveData(session.shop, sinds), {
    headers: { "Cache-Control": "no-store" },
  });
};
