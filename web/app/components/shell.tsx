import { useNavigation } from "@remix-run/react";
import type { ReactNode } from "react";

/**
 * De laadbalk.
 *
 * Elk scherm hier haalt zijn eigen cijfers op en dat duurt merkbaar - de query
 * plus een serverloze functie die koud kan staan. Tot nu toe gebeurde er in die
 * tijd niets: het oude scherm bleef staan en je wist niet of je klik was
 * aangekomen. Nu weet je dat binnen een frame.
 *
 * Remix weet het al: useNavigation staat op "loading" zodra een loader draait.
 * Dit werkt voor het menu in de Shopify-admin, want App Bridge stuurt dat door
 * dezelfde router.
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

/**
 * Het omhulsel van elk scherm.
 *
 * Hier zat een tweede variant in: een eigen navigatiekolom voor het losse
 * dashboard buiten Shopify. Dat dashboard bestaat niet meer, dus die kolom,
 * de uitlogknop en de tabbalk eronder waren dood - en dode code die naar een
 * verwijderde route wijst is precies waar je over een half jaar op struikelt.
 *
 * De admin levert het menu; hier staat alleen nog de laadbalk boven de
 * inhoud.
 */
export function Shell({
  shop,
  children,
}: {
  /** Het winkeldomein. Wordt niet getoond, maar houdt de aanroep eerlijk over
   *  welke winkel dit scherm laat zien. */
  shop: string | null;
  children: ReactNode;
}) {
  void shop;
  return (
    <div className="shell shell--embedded">
      <Laadbalk />
      {children}
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
