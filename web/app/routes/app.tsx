import { json, type LoaderFunctionArgs, type HeadersFunction } from "@remix-run/node";
import { Outlet, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { authenticate } from "~/shopify.server";

/*
 * De ingebedde kant van de app is bewust minimaal. Het instellen en de cijfers
 * staan op ons eigen dashboard (/dashboard); deze route bestaat alleen zodat
 * Shopify de app kan installeren en er een geldige offline sessie ontstaat.
 * Die sessie is wat het dashboard gebruikt om de Admin API te bevragen.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return json({ ok: true });
};

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
