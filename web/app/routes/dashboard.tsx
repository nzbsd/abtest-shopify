import { json, type LoaderFunctionArgs, type LinksFunction } from "@remix-run/node";
import { Outlet, NavLink, useLoaderData, Form } from "@remix-run/react";
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
