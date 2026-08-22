import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate, sessionStorage } from "~/shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  if (session) {
    await sessionStorage.deleteSessions([session.id]);
  }
  return new Response();
};
