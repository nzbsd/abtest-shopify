import { json, type LoaderFunctionArgs, type LinksFunction } from "@remix-run/node";
import { Outlet, useLoaderData, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import styles from "~/styles/dashboard.css?url";
import { Shell } from "~/components/shell";
import { Banner } from "~/components/ui";
import { vereisLogin, winkelDomein } from "~/lib/dashboardAuth.server";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: styles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await vereisLogin(request);
  return json({ shop: await winkelDomein() });
};

export default function DashboardLayout() {
  const { shop } = useLoaderData<typeof loader>();
  return (
    <Shell basis="/dashboard" embedded={false} shop={shop}>
      <Outlet />
    </Shell>
  );
}

/*
 * Vangnet. Zonder dit krijg je bij een onverwachte fout Remix' kale
 * "Application Error" - een leeg scherm dat niet vertelt wat er schort.
 * Instelfouten worden in de loaders al netjes afgehandeld; dit is voor de rest.
 */
export function ErrorBoundary() {
  const error = useRouteError();
  const bericht = isRouteErrorResponse(error)
    ? error.status + " " + error.statusText
    : error instanceof Error
      ? error.message
      : "Onbekende fout";

  return (
    <>
      <link rel="stylesheet" href={styles} />
      <main className="page">
        <h1 className="page__title" style={{ marginBottom: 20 }}>Er ging iets mis</h1>
        <Banner tone="error">
          <div><code>{bericht}</code></div>
          <div style={{ marginTop: 10 }}>
            Gaat dit over een ontbrekende variabele, kijk dan in Vercel onder Settings &rarr;
            Environment Variables. Anders staat de volledige melding in de runtime-logs.
          </div>
        </Banner>
        <div style={{ marginTop: 18 }}>
          <a className="btn" href="/dashboard">Terug naar het overzicht</a>
        </div>
      </main>
    </>
  );
}
