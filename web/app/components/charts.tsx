import { useState } from "react";
import { korteDatum, type Punt } from "~/lib/analytics";
import { Leeg } from "./ui";

/**
 * Lijngrafiek voor twee groepen.
 *
 * Eén y-as, altijd. Twee assen naast elkaar laten je elke gewenste conclusie
 * tekenen door de schalen te kiezen, en dat is precies wat je bij een prijstest
 * niet moet willen.
 */
export function Lijn({
  punten,
  formatteer,
  hoogte = 190,
}: {
  punten: Punt[];
  formatteer: (v: number) => string;
  hoogte?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);

  if (punten.length < 2) {
    return <Leeg>Not enough days to show a trend yet.<br />At least two days of data are needed.</Leeg>;
  }

  const W = 900;
  const H = hoogte;
  const pad = { top: 14, right: 18, bottom: 26, left: 56 };
  const iw = W - pad.left - pad.right;
  const ih = H - pad.top - pad.bottom;

  const max = Math.max(...punten.flatMap((p) => [p.control, p.test]), 0.0001) * 1.18;
  const x = (i: number) => pad.left + (i / (punten.length - 1)) * iw;
  const y = (v: number) => pad.top + ih - (v / max) * ih;

  const pad2 = (k: "control" | "test") =>
    punten.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p[k]).toFixed(1)).join(" ");

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const stap = Math.ceil(punten.length / 8);

  /* Flip the tooltip on POSITION, not on which point it is. With only a few
     points the midpoint test never trips on the last one, so the box ran off
     the right edge and became unreadable — which is exactly where you look
     most, because the newest day sits there. */
  const fractie = hover !== null ? x(hover) / W : 0;
  const rechts = fractie > 0.62;

  return (
    <div style={{ position: "relative" }}>
      <svg
        className="chart"
        viewBox={"0 0 " + W + " " + H}
        style={{ maxHeight: hoogte }}
        role="img"
        aria-label="Daily trend, control group versus test group"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((px - pad.left) / iw) * (punten.length - 1));
          setHover(i >= 0 && i < punten.length ? i : null);
        }}
      >
        {ticks.map((t, i) => (
          <g key={i}>
            <line className="grid-line" x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} />
            <text className="axis" x={pad.left - 10} y={y(t) + 4} textAnchor="end">{formatteer(t)}</text>
          </g>
        ))}

        {punten.map((p, i) =>
          i % stap === 0 ? (
            <text key={i} className="axis" x={x(i)} y={H - 8} textAnchor="middle">{korteDatum(p.dag)}</text>
          ) : null,
        )}

        {hover !== null && (
          <line className="grid-line" x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + ih}
                stroke="var(--line-loud)" />
        )}

        <path className="series" pathLength={1} d={pad2("control")} stroke="var(--control)" />
        <path className="series series--test" pathLength={1} d={pad2("test")} stroke="var(--test)" />

        {hover !== null && (
          <>
            <circle className="dot" cx={x(hover)} cy={y(punten[hover].control)} r={5.5} fill="var(--control)" />
            <circle className="dot" cx={x(hover)} cy={y(punten[hover].test)} r={5.5} fill="var(--test)" />
          </>
        )}
      </svg>

      {hover !== null && (
        <div
          className="tooltip"
          style={{
            // Clamped as well as flipped: on a narrow screen even the flipped
            // box can reach the other edge.
            left: "calc(" + (Math.min(Math.max(fractie, 0.02), 0.98) * 100).toFixed(2) +
              "% + " + (rechts ? "-12px" : "12px") + ")",
            top: 4,
            maxWidth: "min(220px, 60%)",
            transform: rechts ? "translateX(-100%)" : undefined,
          }}
        >
          <div className="tooltip__head">{korteDatum(punten[hover].dag)}</div>
          <div className="legend__item" style={{ marginBottom: 4 }}>
            <span className="swatch swatch--control" />Control&nbsp;
            <strong className="num">{formatteer(punten[hover].control)}</strong>
          </div>
          <div className="legend__item">
            <span className="swatch swatch--test" />Test&nbsp;
            <strong className="num">{formatteer(punten[hover].test)}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Trechter: weergave → cart → order, per groep.
 *
 * De balken zijn geschaald op de grootste waarde in de héle trechter, niet per
 * rij. Anders lijkt elke stap even breed en verdwijnt juist het uitvalspercentage
 * dat je wilt zien.
 */
export function Trechter({
  stappen,
}: {
  stappen: { label: string; control: number; test: number }[];
}) {
  const max = Math.max(...stappen.flatMap((s) => [s.control, s.test]), 1);
  const heel = (v: number) => Math.round(v).toLocaleString("en-US");

  /**
   * Welke stap staat in focus?
   *
   * Zonder focus zijn vijf even felle balken vijf dingen die tegelijk om
   * aandacht vragen, en dan lees je een trechter als een tabel. Met focus lees
   * je hem als een verhaal: dit is de stap waar het misgaat, en de rest is
   * context.
   *
   * De stappen die niet in focus staan worden gearceerd in plaats van grijs.
   * Dat is het verschil dat telt: grijs gooit de kleurcodering weg, waardoor je
   * niet meer ziet welke balk control is en welke test. Arceren neemt alleen de
   * nadruk weg en laat de kleur staan.
   */
  const [focus, setFocus] = useState<number | null>(null);

  return (
    <div className="funnel" onMouseLeave={() => setFocus(null)}>
      {stappen.map((s, i) => {
        const vorige = i > 0 ? stappen[i - 1] : null;
        const behoudC = vorige && vorige.control ? (s.control / vorige.control) * 100 : null;
        const behoudT = vorige && vorige.test ? (s.test / vorige.test) * 100 : null;

        return (
          <div
            className={"funnel__row" + (focus !== null && focus !== i ? " funnel__row--dof" : "")}
            key={s.label}
            onMouseEnter={() => setFocus(i)}
          >
            <span className="funnel__label">{s.label}</span>
            <div className="funnel__bars">
              {([["control", s.control], ["test", s.test]] as const).map(([k, v]) => {
                const breedte = (v / max) * 100;
                // Under a fifth of the width the number no longer fits inside the
                // bar; it gets clipped to a single digit and reads as a wrong
                // figure rather than a small one. Below that it sits beside it.
                const binnen = breedte > 20;
                return (
                  <div className="funnel__lane" key={k}>
                    <div
                      className={"funnel__bar" + (binnen ? "" : " funnel__bar--smal")}
                      style={{ width: breedte + "%", background: "var(--" + k + ")" }}
                    >
                      {binnen && <span className="num">{heel(v)}</span>}
                    </div>
                    {!binnen && <span className="funnel__buiten num">{heel(v)}</span>}
                  </div>
                );
              })}
            </div>
            <span className="small muted num" style={{ minWidth: 96, textAlign: "right" }}>
              {behoudC === null ? "—" : behoudC.toFixed(1) + "% / " + (behoudT ?? 0).toFixed(1) + "%"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Sparkline: het verloop zonder het meubilair.
 *
 * Geen assen, geen gridlijnen, geen punten. Op een kengetalkaart wil niemand
 * een waarde aflezen - die staat er als cijfer boven. Wat een sparkline
 * toevoegt is de vorm: stijgt het, zakt het, of schommelt het? Dat is precies
 * wat een groot getal alleen niet kan vertellen, en het is de reden dat één
 * cijfer zonder context altijd een beetje liegt.
 *
 * Wie de waarden wél wil, klikt door naar de grafiek eronder. Die heeft assen,
 * en daar horen ze.
 */
export function Sparkline({
  punten, kleur, hoogte = 30, label,
}: {
  punten: number[];
  kleur: string;
  hoogte?: number;
  label: string;
}) {
  /* Vier punten als ondergrens, niet twee.
     Met twee punten is een sparkline per definitie een rechte lijn van hoek
     tot hoek, en omdat hij vanaf de laagste waarde schaalt raakt hij ook nog
     beide hoeken - het gevulde vlak wordt dan een driehoek van een halve
     kaart. Dat leest als een grafische fout, en het zegt niets: twee metingen
     hebben geen vorm. Vanaf vier begint er een verloop te ontstaan. */
  if (punten.length < 4) return null;

  const max = Math.max(...punten);
  const min = Math.min(...punten);
  /* Vanaf de laagste waarde in plaats van vanaf nul. Bij omzet per bezoeker
     schommelt alles tussen 0,70 en 1,20 en dan is een nullijn een vlakke lijn
     bovenin de kaart - je ziet de vorm niet meer. De sparkline gaat over
     richting, niet over absolute hoogte; het cijfer erboven doet dat al. */
  const spanne = max - min || 1;
  const marge = 2;
  const bruikbaar = hoogte - marge * 2;

  const xy = punten.map((p, i) => [
    (i / (punten.length - 1)) * 100,
    marge + (1 - (p - min) / spanne) * bruikbaar,
  ]);
  const pad = xy.map(([x, y]) => x.toFixed(2) + "," + y.toFixed(2)).join(" ");

  return (
    <svg
      className="spark"
      viewBox={"0 0 100 " + hoogte}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      {/* fillOpacity en niet opacity: de opacity-eigenschap uit CSS overschrijft
          het gelijknamige attribuut, en de verschijn-animatie eindigt op 1.
          Daardoor werd dit vlak volledig dekkend - een massieve driehoek onder
          elk kengetal in plaats van een zweem. Met fill-opacity staan ze los
          en vermenigvuldigen ze: .12 blijft .12. */}
      <polygon points={"0," + hoogte + " " + pad + " 100," + hoogte} fill={kleur} fillOpacity=".12" />
      {/* non-scaling-stroke: de viewBox rekt niet-uniform op naar de kaart, en
          zonder dit wordt de lijn in een brede kaart een wigvormige streep die
          links dun en rechts dik is. */}
      <polyline
        points={pad}
        fill="none"
        stroke={kleur}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * Stippenmatrix: een staafdiagram zonder assen.
 *
 * Kolommen van stipjes waarbij de hoogte de waarde is. Het leest als een
 * staafdiagram maar houdt zijn vorm op tachtig pixel breed, en het is
 * onmiskenbaar een schatting - je telt geen stipjes af, je ziet een patroon.
 * Dat is precies goed voor een kengetalkaart, waar het exacte getal er al
 * boven staat.
 *
 * Waarom stippen en geen staafjes: een staafje suggereert een continue schaal
 * die je kunt aflezen, en dan wil je er assen bij. Stippen zijn zichtbaar
 * discreet en vragen daar niet om.
 */
export function Matrix({
  waarden, kleur, stappen = 5, label,
}: {
  waarden: number[];
  kleur: string;
  /** Hoeveel stipjes een volle kolom hoog is. */
  stappen?: number;
  label: string;
}) {
  if (!waarden.length) return null;
  const max = Math.max(...waarden, 1);

  return (
    <div className="matrix" role="img" aria-label={label}>
      {waarden.map((w, i) => {
        /* Minstens één stip zodra er iets is. Een lege kolom naast een dag
           met verkeer leest als "geen data", terwijl het "weinig" betekent. */
        const n = w > 0 ? Math.max(1, Math.round((w / max) * stappen)) : 0;
        return (
          <span key={i} className="matrix__kolom">
            {Array.from({ length: stappen }, (_, r) => (
              <span
                key={r}
                className={"matrix__stip" + (r >= stappen - n ? " is-aan" : "")}
                style={{ background: r >= stappen - n ? kleur : undefined }}
              />
            ))}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Het label bij een piek.
 *
 * Eén badge bij het hoogste punt in plaats van een waarde bij elk punt. Dat is
 * de enige aflezing die op een overzichtskaart iets toevoegt: waar zit de piek?
 * De rest van de reeks is vorm, en vorm heeft geen cijfers nodig.
 */
export function Piek({ label }: { label: string }) {
  return <span className="piek">{label}</span>;
}
