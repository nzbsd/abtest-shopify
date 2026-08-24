import { json, type LoaderFunctionArgs, type HeadersFunction, type LinksFunction } from "@remix-run/node";
import { Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import styles from "~/styles/dashboard.css?url";
import { Shell } from "~/components/shell";
import { authenticate } from "~/shopify.server";
import { bewaarWinkelLand } from "~/lib/live.server";
import { zetPixelAan } from "~/lib/pixel.server";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: styles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  // Twee dingen die hooguit één keer per dag echt werk doen en verder een
  // indexlookup zijn: waar de winkel staat (voor de bogen op de bol) en of de
  // web pixel aanstaat (voor de kassastappen).
  //
  // Wél afwachten, allebei. Een belofte die je laat lopen wordt op Vercel
  // afgekapt zodra het antwoord de deur uit is, en dan gebeurt het dus nooit.
  await Promise.all([
    bewaarWinkelLand(admin, session.shop),
    zetPixelAan(admin, session.shop),
  ]);
  return json({ shop: session.shop });
};

export default function EmbeddedLayout() {
  const { shop } = useLoaderData<typeof loader>();
  return (
    <>
      {/* App Bridge levert het menu in de admin-balk. Een custom element en geen
          React-component: dat scheelt de Polaris-afhankelijkheid, die alleen
          voor dit menu ruim 400 kB CSS zou meebrengen. */}
      {/* Volgorde: wie er komt, wat er loopt, iets opzetten, de uitslag lezen.
          Sinds het losse dashboard weg is, is dit het enige menu dat er nog is. */}
      <ui-nav-menu>
        <a href="/app" rel="home">Visitors</a>
        <a href="/app/overview">Overview</a>
        <a href="/app/tests">Tests</a>
        <a href="/app/analytics">Analytics</a>
      </ui-nav-menu>
      <Shell shop={shop}>
        <Outlet />
      </Shell>
    </>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
