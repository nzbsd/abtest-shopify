import { useState } from "react";
import { PageHead } from "~/components/shell";
import { Lijn, Trechter } from "~/components/charts";
import {
  Badge, Banner, Card, CardHead, Delta, IconCart, IconCheck, IconCoins,
  Kpi, Leeg, Legend, Segmented, Track,
} from "~/components/ui";
import {
  beperkTotDagen, dagReeks, geld, heel, looptDagen, ondertekend, procent,
  telOp, type DagRij, type StatRij,
} from "~/lib/analytics";
import {
  benodigdeBezoekers, pTekst, toetsConversie, toetsOmzetPerBezoeker, uitslagTekst,
} from "~/lib/stats";
import type { PriceTest } from "~/lib/priceTest.server";

type Metric = "rpv" | "cr" | "orders" | "visitors";
type Range = "7" | "14" | "30" | "0";

export function AnalyticsView({
  tests, stats, daily,
}: {
  tests: PriceTest[];
  stats: StatRij[];
  daily: DagRij[];
}) {
  const [testId, setTestId] = useState<number | null>(tests[0]?.id ?? null);
  const [metric, setMetric] = useState<Metric>("rpv");
  const [range, setRange] = useState<Range>("14");

  const test = tests.find((t) => t.id === testId) ?? tests[0];

  if (!test) {
    return (
      <main className="page">
        <PageHead titel="Analytics" />
        <Card><Leeg>No tests yet.<br />Create one under Tests.</Leeg></Card>
      </main>
    );
  }

  const ownStats = stats.filter((r) => r.test_id === test.id);
  const ownDaily = beperkTotDagen(daily.filter((r) => r.test_id === test.id), Number(range));

  const c = telOp(ownStats, "control");
  const t = telOp(ownStats, "test");

  const revenueTest = toetsOmzetPerBezoeker(c, t);
  const convTest = toetsConversie(c, t);
  const enough = c.visitors >= 300 && t.visitors >= 300;

  // How many visitors are needed to prove a difference of this size, computed
  // from the spread we actually measure. With no difference visible yet we use
  // 10% — anything smaller is unaffordable to prove for most stores.
  const target = benodigdeBezoekers(c, Math.abs(revenueTest.lift) || 10);
  const progress = target ? Math.min(c.visitors, t.visitors) / target : 0;
  const smallest = Math.min(c.visitors, t.visitors);

  const days = looptDagen(test.started_at);
  const points = dagReeks(ownDaily, metric);

  const format: Record<Metric, (v: number) => string> = {
    rpv: geld,
    cr: (v) => procent(v, 1),
    orders: heel,
    visitors: heel,
  };

  const markets = Array.from(new Set(ownStats.map((r) => r.market || "—"))).sort();

  return (
    <main className="page">
      <PageHead
        titel="Analytics"
        sub={(test.control_title || test.control_product_id) +
          (days !== null ? " · running for " + days + " days" : "")}
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
        {/* ── the verdict ──────────────────────────────────────────────── */}
        <Card>
          <CardHead
            title="Revenue per visitor"
            sub="The measure that decides it. Conversion alone misleads: a higher price nearly always lowers it while revenue can still rise."
          />
          <div className="card__body">
            <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
              <span className="num" style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-.035em" }}>
                {ondertekend(revenueTest.lift)}
              </span>
              {revenueTest.bruikbaar && (
                <span className="small muted num">
                  {revenueTest.significant ? "statistically solid" : "not solid yet"} · {pTekst(revenueTest.p)}
                  {revenueTest.significant &&
                    " · real difference between " + ondertekend(revenueTest.onder) + " and " + ondertekend(revenueTest.boven)}
                </span>
              )}
            </div>

            <Banner tone={!enough || !revenueTest.significant ? "warn" : revenueTest.lift >= 0 ? "ok" : "error"}>
              {uitslagTekst(revenueTest, enough)}
            </Banner>

            {target > 0 && progress < 1 && (
              <div style={{ marginTop: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                  <span className="small muted">Progress towards a reliable answer</span>
                  <span className="small num muted">
                    {heel(smallest)} of {heel(target)} per group
                  </span>
                </div>
                <Track value={progress} color="var(--iris-lit)" />
                <p className="small muted" style={{ marginTop: 8 }}>
                  At the current pace that is roughly{" "}
                  {days && days > 0 && smallest > 0
                    ? Math.ceil((target - smallest) / (smallest / days))
                    : "?"}{" "}
                  more days. Stopping earlier means deciding on noise.
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* ── headline numbers ─────────────────────────────────────────── */}
        <div className="grid grid--4">
          <Kpi
            icon={<IconCoins />} tone="control" label="Revenue / visitor — control"
            value={geld(c.rpv)}
            note={heel(c.visitors) + " visitors · " + heel(c.orders) + " orders"}
          />
          <Kpi
            icon={<IconCoins />} tone="test" label="Revenue / visitor — test"
            value={geld(t.rpv)}
            note={heel(t.visitors) + " visitors · " + heel(t.orders) + " orders"}
            delta={<Delta waarde={revenueTest.lift} />}
          />
          <Kpi
            icon={<IconCheck />} tone="neutral" label="Conversion"
            value={procent(t.cr)}
            note={"control " + procent(c.cr) + " · " + (convTest.bruikbaar ? pTekst(convTest.p) : "too few orders")}
            delta={<Delta waarde={convTest.lift} goedAls="geen" />}
          />
          <Kpi
            icon={<IconCart />} tone="neutral" label="Average order value"
            value={geld(t.aov)}
            note={"control " + geld(c.aov)}
            delta={<Delta waarde={c.aov ? ((t.aov - c.aov) / c.aov) * 100 : 0} />}
          />
        </div>

        {/* ── trend ────────────────────────────────────────────────────── */}
        <Card>
          <CardHead
            title="Daily trend"
            action={
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <Segmented
                  value={metric}
                  onChange={setMetric}
                  options={[
                    { key: "rpv" as Metric, label: "Rev / visitor" },
                    { key: "cr" as Metric, label: "Conversion" },
                    { key: "orders" as Metric, label: "Orders" },
                    { key: "visitors" as Metric, label: "Visitors" },
                  ]}
                />
                <Segmented
                  value={range}
                  onChange={setRange}
                  options={[
                    { key: "7" as Range, label: "7d" },
                    { key: "14" as Range, label: "14d" },
                    { key: "30" as Range, label: "30d" },
                    { key: "0" as Range, label: "All" },
                  ]}
                />
              </div>
            }
          />
          <div className="card__body">
            <div style={{ marginBottom: 14 }}><Legend /></div>
            <Lijn punten={points} formatteer={format[metric]} />
          </div>
        </Card>

        <div className="grid grid--2">
          {/* ── funnel ─────────────────────────────────────────────────── */}
          <Card>
            <CardHead title="Funnel" sub="On the right, the share that made it from the previous step: control / test." />
            <div className="card__body">
              <div style={{ marginBottom: 16 }}><Legend /></div>
              <Trechter
                stappen={[
                  { label: "Visitors", control: c.visitors, test: t.visitors },
                  { label: "Added to cart", control: c.atc, test: t.atc },
                  { label: "Orders", control: c.orders, test: t.orders },
                ]}
              />
            </div>
          </Card>

          {/* ── per group ──────────────────────────────────────────────── */}
          <Card>
            <CardHead title="Per group" />
            <div className="card__body card__body--flush table-scroll">
              <table>
                <thead>
                  <tr><th>Group</th><th>Visitors</th><th>Cart</th><th>Orders</th><th>Revenue</th><th>/ visitor</th></tr>
                </thead>
                <tbody>
                  {([["control", "Control", c], ["test", "Test", t]] as const).map(([k, label, g]) => (
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

        {/* ── per market ───────────────────────────────────────────────── */}
        {markets.length > 0 && (
          <Card>
            <CardHead
              title="Per market"
              sub="Individual markets have far fewer visitors each, so read these as direction rather than verdict."
            />
            <div className="card__body card__body--flush table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Market</th><th>Visitors control</th><th>/ visitor</th>
                    <th>Visitors test</th><th>/ visitor</th><th>Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {markets.map((m) => {
                    const rows = (co: string) =>
                      ownStats.filter((r) => (r.market || "—") === m && r.cohort === co);
                    const gc = telOp(rows("control"), "control");
                    const gt = telOp(rows("test"), "test");
                    const d = gc.rpv > 0 ? ((gt.rpv - gc.rpv) / gc.rpv) * 100 : 0;
                    const thin = gc.visitors < 100 || gt.visitors < 100;
                    return (
                      <tr key={m}>
                        <td>{m}</td>
                        <td>{heel(gc.visitors)}</td>
                        <td>{geld(gc.rpv)}</td>
                        <td>{heel(gt.visitors)}</td>
                        <td>{geld(gt.rpv)}</td>
                        <td>
                          {gc.rpv > 0
                            ? thin
                              ? <span className="delta delta--flat num" title="Too few visitors for this to mean anything">{ondertekend(d)}</span>
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
