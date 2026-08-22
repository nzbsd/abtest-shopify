import { json, type LoaderFunctionArgs, type HeadersFunction, type LinksFunction } from "@remix-run/node";
import { Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import styles from "~/styles/dashboard.css?url";
import { Shell } from "~/components/shell";
import { authenticate } from "~/shopify.server";
import { maakSsoToken } from "~/lib/dashboardAuth.server";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: styles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const basis = (process.env.SHOPIFY_APP_URL || "").replace(/\/+$/, "");
  // Kortlevend kaartje om hetzelfde dashboard in een eigen venster te openen,
  // zonder daar opnieuw een wachtwoord te hoeven intypen.
  return json({ shop: session.shop, losseUrl: basis + "/dashboard/sso?t=" + maakSsoToken(session.shop) });
};

export default function EmbeddedLayout() {
  const { shop, losseUrl } = useLoaderData<typeof loader>();
  return (
    <>
      {/* App Bridge levert het menu in de admin-balk. Een custom element en geen
          React-component: dat scheelt de Polaris-afhankelijkheid, die alleen
          voor dit menu ruim 400 kB CSS zou meebrengen. */}
      <ui-nav-menu>
        <a href="/app" rel="home">Overview</a>
        <a href="/app/analytics">Analytics</a>
        <a href="/app/tests">Tests</a>
      </ui-nav-menu>
      <Shell basis="/app" embedded shop={shop}>
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "14px 20px 0" }}>
          <a className="btn btn--sm" href={losseUrl} target="_blank" rel="noreferrer">
            Open in its own window
          </a>
        </div>
        <Outlet />
      </Shell>
    </>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
