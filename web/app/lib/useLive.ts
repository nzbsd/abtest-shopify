import { useEffect, useRef, useState } from "react";

/**
 * Het levende deel ophalen, elke vijftien seconden.
 *
 * WAAROM NIET DE HELE PAGINA HERLADEN
 * Remix kan de loader opnieuw draaien, en dat is één regel code. Maar die
 * loader rekent de hele periode door - vierduizend sessies, elf dimensies,
 * pagina's, routes, de tijdreeks - en dat is driehonderdvijftig milliseconde
 * voor zes getallen die veranderd zijn. Elke vijftien seconden. Dit haalt
 * alleen wat beweegt: drie milliseconde.
 *
 * ELKE RONDE VRAAGT "WAT IS ER SINDS TOEN"
 * De servertijd van de vorige ronde gaat mee terug. Daardoor is een order
 * precies één keer nieuw: niet gemist als er twee in hetzelfde venster vallen,
 * en niet dubbel als een ronde wat later komt. De eerste ronde zet alleen de
 * klok gelijk en meldt niets - anders krijg je bij het openen de laatste
 * minuten als vuurwerk over je scherm.
 */

export type LiveLand = { land: string; actief: number };
export type LiveOrder = { land: string; cents: number; op: string };
export type Live = {
  nu: number;
  landen: LiveLand[];
  orders: LiveOrder[];
  winkelLand: string | null;
  op: string;
};

const TUSSENPOOS = 15_000;

export function useLive(basis: string): Live | null {
  const [live, setLive] = useState<Live | null>(null);
  const sinds = useRef<string | null>(null);

  useEffect(() => {
    let gestopt = false;
    let klok = 0;

    const haal = async () => {
      try {
        const q = sinds.current ? "?sinds=" + encodeURIComponent(sinds.current) : "";
        const antwoord = await fetch(basis + "/live" + q, {
          headers: { Accept: "application/json" },
          credentials: "same-origin",
        });
        if (!antwoord.ok || gestopt) return;
        const d = (await antwoord.json()) as Live;
        sinds.current = d.op;
        if (!gestopt) setLive(d);
      } catch {
        // Een gemiste ronde is geen probleem: over vijftien seconden weer.
        // Wel de klok laten staan, anders mist de volgende ronde de orders
        // die er tussendoor waren.
      }
    };

    const plan = () => {
      klok = window.setTimeout(async () => {
        // Op de achtergrond niets vragen. Bij terugkomst haalt de
        // zichtbaarheidsluisteraar het meteen in.
        if (!document.hidden) await haal();
        if (!gestopt) plan();
      }, TUSSENPOOS);
    };

    const opZicht = () => { if (!document.hidden) haal(); };
    document.addEventListener("visibilitychange", opZicht);

    haal();
    plan();

    return () => {
      gestopt = true;
      clearTimeout(klok);
      document.removeEventListener("visibilitychange", opZicht);
    };
  }, [basis]);

  return live;
}
