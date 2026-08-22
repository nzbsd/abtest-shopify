import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData } from "@remix-run/react";

/**
 * App Bridge wordt alleen geladen wanneer Shopify de app in zijn admin opent.
 *
 * Hij is dan nodig om de sessie levend te houden bij navigatie. Op het losse
 * dashboard heeft hij niets te zoeken: dat zou een extern script toevoegen aan
 * een pagina die er niets aan heeft.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const embedded =
    url.pathname.startsWith("/app") ||
    url.searchParams.has("host") ||
    url.searchParams.has("embedded");
  return json({ apiKey: embedded ? process.env.SHOPIFY_API_KEY || "" : "" });
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <html lang="nl">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        {apiKey && (
          <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js" data-api-key={apiKey} />
        )}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
