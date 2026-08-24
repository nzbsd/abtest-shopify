import { Form, NavLink, useNavigation } from "@remix-run/react";
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
/**
 * De laadbalk.
 *
 * Elk scherm hier haalt zijn eigen cijfers op en dat duurt merkbaar - de query
 * plus een serverloze functie die koud kan staan. Tot nu toe gebeurde er in die
 * tijd niets: het oude scherm bleef staan en je wist niet of je klik was
 * aangekomen. Nu weet je dat binnen een frame.
 *
 * Remix weet het al: useNavigation staat op "loading" zodra een loader draait.
 * Dit werkt daarmee voor de eigen rail én voor het menu in de Shopify-admin,
 * want App Bridge stuurt die door dezelfde router.
 */
function Laadbalk() {
  const nav = useNavigation();
  if (nav.state === "idle") return null;
  return (
    <div className="laadbalk" role="status" aria-label="Loading">
      <span />
    </div>
  );
}

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
    // Bezoekers staat voorop en is de voordeur: dat is wat je 's ochtends wilt
    // zien, en het is het enige scherm dat ook iets zegt als er geen test loopt.
    { to: basis, label: "Visitors", Icon: IconUsers, end: true },
    { to: basis + "/overview", label: "Overview", Icon: IconGrid, end: false },
    { to: basis + "/tests", label: "Tests", Icon: IconFlask, end: false },
    { to: basis + "/analytics", label: "Analytics", Icon: IconChart, end: false },
  ];

  if (embedded) {
    return (
      <div className="shell shell--embedded">
        <Laadbalk />
        {children}
      </div>
    );
  }

  return (
    <div className="shell shell--railed">
      <Laadbalk />
      <aside className="rail">
        <a className="rail__brand" href={basis}>
          <span className="rail__mark"><span /></span>
          <span className="rail__name">Experli</span>
        </a>

        <nav className="rail__nav">
          {nav.map(({ to, label, Icon, end }) => (
            <NavLink key={to} to={to} end={end}
                     className={({ isPending }) =>
                       "rail__link" + (isPending ? " rail__link--wacht" : "")}>
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
