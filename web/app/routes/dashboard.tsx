import { json, type LoaderFunctionArgs, type LinksFunction } from "@remix-run/node";
import { Outlet, NavLink, useLoaderData, useRouteError, isRouteErrorResponse, Form } from "@remix-run/react";
import styles from "~/styles/dashboard.css?url";
import { vereisLogin, winkelDomein } from "~/lib/dashboardAuth.server";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: styles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await vereisLogin(request);
  return json({ shop: await winkelDomein() });
};

export default function DashboardLayout() {
  const { shop } = useLoaderData<typeof loader>();

  return (
    <>
      <header className="topbar">
        <a className="topbar__brand" href="/dashboard">
          <span className="topbar__dot" />
          Price Test
        </a>
        <nav className="topbar__nav">
          <NavLink to="/dashboard" end className="topbar__link">Analytics</NavLink>
          <NavLink to="/dashboard/tests" className="topbar__link">Tests</NavLink>
        </nav>
        <span className="topbar__spacer" />
        {shop && <span className="topbar__shop">{shop}</span>}
        <Form method="post" action="/dashboard/logout">
          <button className="btn" type="submit">Uitloggen</button>
        </Form>
      </header>
      <Outlet />
    </>
  );
}

/*
 * Vangnet. Zonder dit krijg je bij elke onverwachte fout Remix' kale
 * "Application Error" - een leeg scherm dat niet vertelt wat er schort en waar
 * je dus niets mee kunt. Instelfouten worden hierboven al netjes afgehandeld;
 * dit is voor alles wat we niet zagen aankomen.
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
        <h1>Er ging iets mis</h1>
        <div className="banner banner--error" style={{ marginTop: 16 }}>
          <div><code>{bericht}</code></div>
          <div style={{ marginTop: 10 }}>
            Staat hier iets over een ontbrekende variabele, kijk dan in Vercel onder
            Settings &rarr; Environment Variables. Anders staat de volledige melding in de
            runtime-logs van de deploy.
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <a className="btn" href="/dashboard">Terug naar het dashboard</a>
        </div>
      </main>
    </>
  );
}
