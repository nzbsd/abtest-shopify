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
  hoogte = 260,
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
  const pad = { top: 18, right: 20, bottom: 30, left: 62 };
  const iw = W - pad.left - pad.right;
  const ih = H - pad.top - pad.bottom;

  const max = Math.max(...punten.flatMap((p) => [p.control, p.test]), 0.0001) * 1.18;
  const x = (i: number) => pad.left + (i / (punten.length - 1)) * iw;
  const y = (v: number) => pad.top + ih - (v / max) * ih;

  const pad2 = (k: "control" | "test") =>
    punten.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p[k]).toFixed(1)).join(" ");

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const stap = Math.ceil(punten.length / 8);
  const rechts = hover !== null && hover > punten.length / 2;

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

        <path className="series" d={pad2("control")} stroke="var(--control)" />
        <path className="series" d={pad2("test")} stroke="var(--test)" />

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
            left: "calc(" + ((x(hover) / W) * 100).toFixed(2) + "% + " + (rechts ? "-14px" : "14px") + ")",
            top: 6,
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

  return (
    <div className="funnel">
      {stappen.map((s, i) => {
        const vorige = i > 0 ? stappen[i - 1] : null;
        const behoudC = vorige && vorige.control ? (s.control / vorige.control) * 100 : null;
        const behoudT = vorige && vorige.test ? (s.test / vorige.test) * 100 : null;

        return (
          <div className="funnel__row" key={s.label}>
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
