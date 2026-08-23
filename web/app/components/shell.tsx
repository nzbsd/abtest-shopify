import { Form, NavLink } from "@remix-run/react";
import type { ReactNode } from "react";
import { IconChart, IconFlask, IconGrid, IconUsers } from "./ui";

/**
 * Omhulsel voor beide plekken waar het dashboard leeft.
 *
 * Los draait het met een eigen rail. Ingebed in Shopify vervalt die: de admin
 * levert daar al een menu, en een tweede navigatiekolom in een iframe van 900
 * pixels breed eet de helft van de ruimte op zonder iets toe te voegen.
 *
 * De schermen eronder zijn in beide gevallen exact dezelfde componenten.
 */
export function Shell({
  basis,
  embedded,
  shop,
  children,
}: {
  /** "/dashboard" of "/app" - alle links hangen hieraan. */
  basis: string;
  embedded: boolean;
  shop: string | null;
  children: ReactNode;
}) {
  const nav = [
    // Volgorde zoals je ze gebruikt: kijken wat er loopt, iets opzetten,
    // de uitslag lezen. Analytics stond in het midden, tussen twee schermen
    // waar je heen gaat vóórdat er iets te lezen valt.
    { to: basis, label: "Overview", Icon: IconGrid, end: true },
    { to: basis + "/tests", label: "Tests", Icon: IconFlask, end: false },
    { to: basis + "/visitors", label: "Visitors", Icon: IconUsers, end: false },
    { to: basis + "/analytics", label: "Analytics", Icon: IconChart, end: false },
  ];

  if (embedded) {
    return <div className="shell shell--embedded">{children}</div>;
  }

  return (
    <div className="shell shell--railed">
      <aside className="rail">
        <a className="rail__brand" href={basis}>
          <span className="rail__mark"><span /></span>
          <span className="rail__name">Experli</span>
        </a>

        <nav className="rail__nav">
          {nav.map(({ to, label, Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="rail__link">
              <Icon />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="rail__foot">
          {shop && <span className="rail__shop num">{shop}</span>}
          <Form method="post" action="/dashboard/logout" style={{ marginTop: 12 }}>
            <button className="btn btn--sm btn--vol" type="submit">
              Sign out
            </button>
          </Form>
        </div>
      </aside>

      {children}

      {/* Onder 1000px is de rail weg; navigatie gaat naar onderen in plaats van
          achter een hamburger waar niemand hem zoekt. */}
      <nav className="tabbar">
        {nav.map(({ to, label, Icon, end }) => (
          <NavLink key={to} to={to} end={end}>
            <Icon />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function PageHead({
  titel,
  sub,
  actie,
}: {
  titel: string;
  sub?: string;
  actie?: ReactNode;
}) {
  return (
    <div className="page__head">
      <div style={{ minWidth: 0 }}>
        <h1 className="page__title">{titel}</h1>
        {sub && <p className="page__sub">{sub}</p>}
      </div>
      {actie}
    </div>
  );
}
