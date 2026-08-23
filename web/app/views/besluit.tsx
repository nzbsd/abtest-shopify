import { useState } from "react";
import { Modal } from "~/components/ui";
import type { PriceTest } from "~/lib/priceTest.server";

/**
 * Wat je besloot toen de test stopte.
 *
 * WAAROM DIT ERBIJ HOORT
 * Een gestopte test zonder besluit is over een half jaar niet meer waard dan
 * "daar hebben we ooit iets mee gedaan". De cijfers staan er nog, maar wat je
 * ermee deed en waarom niet - en juist dat is wat iemand nodig heeft die
 * overweegt hetzelfde nog eens te testen.
 *
 * Het wordt gevraagd op het moment van stoppen, niet als los invulveld
 * achteraf. Dat is het enige moment waarop je het antwoord nog paraat hebt.
 *
 * "Niets besloten" staat er bewust als volwaardige keuze tussen. Het gebeurt,
 * en het eerlijk vastleggen is beter dan een leeg veld dat suggereert dat
 * iemand het nog gaat invullen.
 */

export const BESLUITEN = [
  {
    key: "uitrollen",
    naam: "Rolled it out",
    sub: "The variant becomes the new normal",
  },
  {
    key: "verwerpen",
    naam: "Dropped it",
    sub: "Kept the original",
  },
  {
    key: "onbeslist",
    naam: "No clear answer",
    sub: "Ran out of traffic, patience, or both",
  },
  {
    key: "opnieuw",
    naam: "Testing it again",
    sub: "Something was off — retry with a change",
  },
] as const;

export function besluitNaam(k: string | null | undefined): string {
  return BESLUITEN.find((b) => b.key === k)?.naam ?? "";
}

export function BesluitModal({
  test, onSluit, onStop, bezig,
}: {
  test: PriceTest;
  onSluit: () => void;
  onStop: (besluit: string, notitie: string) => void;
  bezig: boolean;
}) {
  const [besluit, setBesluit] = useState<string>("");
  const [notitie, setNotitie] = useState("");

  return (
    <Modal
      titel="Stopping this test"
      sub="Traffic goes back to the original straight away. What you decided is worth a sentence now — in six months the numbers alone will not tell you."
      onSluit={onSluit}
      voet={
        <>
          <button type="button" className="btn btn--sm" onClick={onSluit}>Cancel</button>
          <span style={{ flex: 1 }} />
          {/* Overslaan mag: iemand tegenhouden die alleen maar wil stoppen is
              erger dan een test zonder besluit. */}
          <button type="button" className="btn btn--sm" disabled={bezig}
                  onClick={() => onStop("", "")}>
            Stop without a note
          </button>
          <button type="button" className="btn btn--sm btn--danger" disabled={bezig || !besluit}
                  onClick={() => onStop(besluit, notitie.trim())}>
            {bezig ? "Stopping…" : "Stop test"}
          </button>
        </>
      }
    >
      <div className="doel__lijst">
        {BESLUITEN.map((b) => (
          <button key={b.key} type="button" className="doelrij"
                  aria-pressed={besluit === b.key}
                  onClick={() => setBesluit(b.key)}>
            <span className="doelrij__vink" aria-hidden />
            <span className="doelrij__body">
              <span className="doelrij__regel">
                <span className="doelrij__naam">{b.naam}</span>
                <span className="doelrij__kort">{b.sub}</span>
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
        <span className="field__label">Why, in one line</span>
        <input type="text" value={notitie} onChange={(e) => setNotitie(e.target.value)}
               placeholder={
                 besluit === "uitrollen" ? "Won on revenue per visitor, subscriptions held"
                 : besluit === "verwerpen" ? "Lost on mobile, which is most of our traffic"
                 : besluit === "opnieuw" ? "Split was off — rerun once the redirect is fixed"
                 : "Too little traffic to tell either way"
               } />
        <span className="field__hint">
          {test.hypothese
            ? "You expected: “" + test.hypothese + "”. Was that right?"
            : "The one thing your future self will want to know."}
        </span>
      </div>
    </Modal>
  );
}
