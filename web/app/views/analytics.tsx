import { useState } from "react";
import { PageHead } from "~/components/shell";
import { Lijn, Trechter } from "~/components/charts";
import {
  Badge, Banner, Card, CardHead, Delta, IconCart, IconCheck, IconCoins, IconUsers,
  Kpi, Leeg, Legend, Segmented, Track,
} from "~/components/ui";
import {
  beperkTotDagen, dagReeks, geld, heel, korteDatum, looptDagen, ondertekend, procent,
  telOp, type DagRij, type StatRij,
} from "~/lib/analytics";
import {
  benodigdeBezoekers, pTekst, toetsConversie, toetsOmzetPerBezoeker, uitslagTekst,
} from "~/lib/stats";
import type { PriceTest } from "~/lib/priceTest.server";

type Maat = "rpv" | "cr" | "orders" | "visitors";
type Bereik = "7" | "14" | "30" | "0";

export function AnalyticsView({
  tests, stats, daily,
}: {
  tests: PriceTest[];
  stats: StatRij[];
  daily: DagRij[];
}) {
  const [testId, setTestId] = useState<number | null>(tests[0]?.id ?? null);
  const [maat, setMaat] = useState<Maat>("rpv");
  const [bereik, setBereik] = useState<Bereik>("14");

  const test = tests.find((t) => t.id === testId) ?? tests[0];

  if (!test) {
    return (
      <main className="page">
        <PageHead titel="Analytics" />
        <Card><Leeg>Nog geen test aangemaakt.<br />Maak er een aan onder Tests.</Leeg></Card>
      </main>
    );
  }

  const eigenStats = stats.filter((r) => r.test_id === test.id);
  const eigenDaily = beperkTotDagen(daily.filter((r) => r.test_id === test.id), Number(bereik));

  const c = telOp(eigenStats, "control");
  const t = telOp(eigenStats, "test");

  const omzetToets = toetsOmzetPerBezoeker(c, t);
  const convToets = toetsConversie(c, t);
  const genoeg = c.visitors >= 300 && t.visitors >= 300;

  // Hoeveel bezoekers je nodig hebt om een verschil van deze omvang te kunnen
  // aantonen, gerekend met de spreiding die we werkelijk meten. Zie je nog geen
  // verschil, dan rekenen we met 10% - kleiner dan dat is voor de meeste
  // winkels onbetaalbaar om aan te tonen.
  const doelPerGroep = benodigdeBezoekers(c, Math.abs(omzetToets.lift) || 10);
  const voortgang = doelPerGroep ? Math.min(c.visitors, t.visitors) / doelPerGroep : 0;

  const dagen = looptDagen(test.started_at);
  const punten = dagReeks(eigenDaily, maat);

  const formatteer: Record<Maat, (v: number) => string> = {
    rpv: geld,
    cr: (v) => procent(v, 1),
    orders: heel,
    visitors: heel,
  };

  const markten = Array.from(new Set(eigenStats.map((r) => r.market || "—"))).sort();

  return (
    <main className="page">
      <PageHead
        titel="Analytics"
        sub={(test.control_title || test.control_product_id) + (dagen !== null ? " · loopt " + dagen + " dagen" : "")}
        actie={
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <Badge status={test.status} />
            {tests.length > 1 && (
              <select value={String(test.id)} onChange={(e) => setTestId(Number(e.target.value))}
                      style={{ width: "auto", minWidth: 220 }}>
                {tests.map((x) => (
                  <option key={x.id} value={x.id}>{x.control_title || x.control_product_id}</option>
                ))}
              </select>
            )}
          </div>
        }
      />

      <div className="stack">
        {/* ── de uitslag ───────────────────────────────────────────────── */}
        <Card>
          <CardHead
            title="Omzet per bezoeker"
            sub="De maat die telt. Conversie alleen misleidt: een hogere prijs drukt die bijna altijd, terwijl de omzet kan stijgen."
          />
          <div className="card__body">
            <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
              <span className="num" style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-.035em" }}>
                {ondertekend(omzetToets.lift)}
              </span>
              {omzetToets.bruikbaar && (
                <span className="small muted num">
                  {omzetToets.significant ? "aantoonbaar" : "nog niet aantoonbaar"} · {pTekst(omzetToets.p)}
                  {omzetToets.significant &&
                    " · werkelijk verschil tussen " + ondertekend(omzetToets.onder) + " en " + ondertekend(omzetToets.boven)}
                </span>
              )}
            </div>

            <Banner tone={!genoeg || !omzetToets.significant ? "warn" : omzetToets.lift >= 0 ? "ok" : "error"}>
              {uitslagTekst(omzetToets, genoeg)}
            </Banner>

            {doelPerGroep > 0 && voortgang < 1 && (
              <div style={{ marginTop: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                  <span className="small muted">Voortgang naar een betrouwbare uitslag</span>
                  <span className="small num muted">
                    {heel(Math.min(c.visitors, t.visitors))} van {heel(doelPerGroep)} per groep
                  </span>
                </div>
                <Track value={voortgang} color="var(--iris-lit)" />
                <p className="small muted" style={{ marginTop: 8 }}>
                  Bij het huidige tempo heb je nog ongeveer{" "}
                  {dagen && dagen > 0 && Math.min(c.visitors, t.visitors) > 0
                    ? Math.ceil(((doelPerGroep - Math.min(c.visitors, t.visitors)) / (Math.min(c.visitors, t.visitors) / dagen)))
                    : "?"}{" "}
                  dagen nodig. Eerder stoppen betekent dat je op ruis besluit.
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* ── kerncijfers ──────────────────────────────────────────────── */}
        <div className="grid grid--4">
          <Kpi
            icon={<IconCoins />} tone="control" label="Omzet / bezoeker — controle"
            value={geld(c.rpv)}
            note={heel(c.visitors) + " bezoekers · " + heel(c.orders) + " orders"}
          />
          <Kpi
            icon={<IconCoins />} tone="test" label="Omzet / bezoeker — test"
            value={geld(t.rpv)}
            note={heel(t.visitors) + " bezoekers · " + heel(t.orders) + " orders"}
            delta={<Delta waarde={omzetToets.lift} />}
          />
          <Kpi
            icon={<IconCheck />} tone="neutral" label="Conversie"
            value={procent(t.cr)}
            note={"controle " + procent(c.cr) + " · " + (convToets.bruikbaar ? pTekst(convToets.p) : "te weinig orders")}
            delta={<Delta waarde={convToets.lift} goedAls="geen" />}
          />
          <Kpi
            icon={<IconCart />} tone="neutral" label="Gemiddelde orderwaarde"
            value={geld(t.aov)}
            note={"controle " + geld(c.aov)}
            delta={<Delta waarde={c.aov ? ((t.aov - c.aov) / c.aov) * 100 : 0} />}
          />
        </div>

        {/* ── verloop ──────────────────────────────────────────────────── */}
        <Card>
          <CardHead
            title="Verloop per dag"
            action={
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <Segmented
                  value={maat}
                  onChange={setMaat}
                  options={[
                    { key: "rpv" as Maat, label: "Omzet / bez." },
                    { key: "cr" as Maat, label: "Conversie" },
                    { key: "orders" as Maat, label: "Orders" },
                    { key: "visitors" as Maat, label: "Bezoekers" },
                  ]}
                />
                <Segmented
                  value={bereik}
                  onChange={setBereik}
                  options={[
                    { key: "7" as Bereik, label: "7d" },
                    { key: "14" as Bereik, label: "14d" },
                    { key: "30" as Bereik, label: "30d" },
                    { key: "0" as Bereik, label: "Alles" },
                  ]}
                />
              </div>
            }
          />
          <div className="card__body">
            <div style={{ marginBottom: 14 }}><Legend /></div>
            <Lijn punten={punten} formatteer={formatteer[maat]} />
          </div>
        </Card>

        <div className="grid grid--2">
          {/* ── trechter ───────────────────────────────────────────────── */}
          <Card>
            <CardHead title="Trechter" sub="Rechts het aandeel dat de vorige stap haalde: controle / test." />
            <div className="card__body">
              <div style={{ marginBottom: 16 }}><Legend /></div>
              <Trechter
                stappen={[
                  { label: "Bezoekers", control: c.visitors, test: t.visitors },
                  { label: "In de cart", control: c.atc, test: t.atc },
                  { label: "Orders", control: c.orders, test: t.orders },
                ]}
              />
            </div>
          </Card>

          {/* ── per groep ──────────────────────────────────────────────── */}
          <Card>
            <CardHead title="Per groep" />
            <div className="card__body card__body--flush table-scroll">
              <table>
                <thead>
                  <tr><th>Groep</th><th>Bezoekers</th><th>Cart</th><th>Orders</th><th>Omzet</th><th>/ bezoeker</th></tr>
                </thead>
                <tbody>
                  {([["control", "Controle", c], ["test", "Test", t]] as const).map(([k, label, g]) => (
                    <tr key={k}>
                      <td>
                        <span className="cell-series"><span className={"swatch swatch--" + k} />{label}</span>
                      </td>
                      <td>{heel(g.visitors)}</td>
                      <td>{heel(g.atc)}</td>
                      <td>{heel(g.orders)}</td>
                      <td>{geld(g.revenueCents / 100)}</td>
                      <td><strong>{geld(g.rpv)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* ── per markt ────────────────────────────────────────────────── */}
        {markten.length > 0 && (
          <Card>
            <CardHead
              title="Per markt"
              sub="Losse markten hebben elk veel minder bezoekers, dus lees deze cijfers als richting en niet als uitslag."
            />
            <div className="card__body card__body--flush table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Markt</th><th>Bez. controle</th><th>/ bezoeker</th>
                    <th>Bez. test</th><th>/ bezoeker</th><th>Verschil</th>
                  </tr>
                </thead>
                <tbody>
                  {markten.map((m) => {
                    const rij = (co: string) =>
                      eigenStats.filter((r) => (r.market || "—") === m && r.cohort === co);
                    const gc = telOp(rij("control"), "control");
                    const gt = telOp(rij("test"), "test");
                    const d = gc.rpv > 0 ? ((gt.rpv - gc.rpv) / gc.rpv) * 100 : 0;
                    const dun = gc.visitors < 100 || gt.visitors < 100;
                    return (
                      <tr key={m}>
                        <td>{m}</td>
                        <td>{heel(gc.visitors)}</td>
                        <td>{geld(gc.rpv)}</td>
                        <td>{heel(gt.visitors)}</td>
                        <td>{geld(gt.rpv)}</td>
                        <td>
                          {gc.rpv > 0
                            ? dun
                              ? <span className="delta delta--flat num" title="Te weinig bezoekers voor een betekenisvol verschil">{ondertekend(d)}</span>
                              : <Delta waarde={d} />
                            : <span className="muted">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </main>
  );
}
