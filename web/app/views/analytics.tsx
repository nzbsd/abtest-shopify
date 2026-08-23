import { useState } from "react";
import { useSearchParams } from "@remix-run/react";
import { PageHead } from "~/components/shell";
import { Lijn, Trechter } from "~/components/charts";
import {
  Badge, Banner, Card, CardHead, Delta, IconCart, IconCheck, IconCoins,
  Kpi, Leeg, Legend, Segmented, Tabs, Track, Vergelijk,
} from "~/components/ui";
import {
  bedragVerschil, beperkTotDagen, combineer, dagReeks, geld, heel, korteDatum, looptDagen, ondertekend, procent,
  telOp, type DagRij, type StatRij,
} from "~/lib/analytics";
import type { OrderCijfers, OrderResultaat } from "~/lib/orders.server";
import {
  benodigdeBezoekers, pTekst, toetsAandeel, toetsConversie, toetsOmzetPerBezoeker, uitslagTekst,
} from "~/lib/stats";
import type { PriceTest } from "~/lib/priceTest.server";
import { ForecastView } from "./forecast";

type Metric = "rpv" | "cr" | "orders" | "visitors";
type Range = "7" | "14" | "30" | "0";

const GEEN: OrderCijfers = {
  orders: 0, units: 0, revenueCents: 0, revenueSqCents: 0, subOrders: 0, subRevenueCents: 0,
};

export function AnalyticsView({
  tests, stats, daily, orders = {},
}: {
  tests: PriceTest[];
  stats: StatRij[];
  daily: DagRij[];
  /** Per test-id de ordercijfers zoals ze bij Shopify staan. */
  orders?: Record<number, OrderResultaat>;
}) {
  // ?test= in the URL so a link from the Tests screen opens the right one.
  const [params, setParams] = useSearchParams();
  const uitUrl = Number(params.get("test")) || null;
  const [gekozen, setGekozen] = useState<number | null>(null);
  const testId = gekozen ?? uitUrl ?? tests[0]?.id ?? null;
  const setTestId = (id: number) => { setGekozen(id); setParams({ test: String(id) }, { replace: true }); };
  type Tab = "verdict" | "orders" | "segments" | "forecast";
  const [tab, setTab] = useState<Tab>("verdict");
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

  const ord = orders[test.id];
  const oc = ord?.control ?? GEEN;
  const ot = ord?.test ?? GEEN;

  const c = combineer(telOp(ownStats, "control"), oc);
  const t = combineer(telOp(ownStats, "test"), ot);

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
  /* Days come from two places: visitors from our own events, orders and money
     from Shopify. Merged here so one chart can switch between them. */
  const points = (() => {
    const geldMaat = metric === "rpv" || metric === "orders" || metric === "cr";
    const bezoekersReeks = dagReeks(ownDaily, geldMaat ? "visitors" : metric);
    if (!geldMaat) return bezoekersReeks;

    const dagen = Array.from(new Set([
      ...bezoekersReeks.map((p) => p.dag),
      ...Object.keys(ord?.perDag ?? {}),
    ])).sort().filter((d) => !Number(range) || d >= new Date(Date.now() - Number(range) * 864e5).toISOString().slice(0, 10));

    return dagen.map((dag) => {
      const bez = bezoekersReeks.find((p) => p.dag === dag);
      const o = ord?.perDag?.[dag];
      const waarde = (co: "control" | "test") => {
        const g = o?.[co];
        if (!g) return 0;
        if (metric === "orders") return g.orders;
        const v = co === "control" ? bez?.control ?? 0 : bez?.test ?? 0;
        if (metric === "cr") return v ? (g.orders / v) * 100 : 0;
        return v ? g.revenueCents / 100 / v : 0;
      };
      return { dag, control: waarde("control"), test: waarde("test") };
    });
  })();

  const format: Record<Metric, (v: number) => string> = {
    rpv: geld,
    cr: (v) => procent(v, 1),
    orders: heel,
    visitors: heel,
  };

  const markets = Array.from(new Set(ownStats.map((r) => r.market || "—"))).sort();

  const subToets = toetsAandeel(oc.subOrders, oc.orders, ot.subOrders, ot.orders);
  const subAandeel = (o: OrderCijfers) => (o.orders ? (o.subOrders / o.orders) * 100 : 0);
  const subOmzetAandeel = (o: OrderCijfers) =>
    o.revenueCents ? (o.subRevenueCents / o.revenueCents) * 100 : 0;

  const variantNamen = Object.keys(ord?.perVariant ?? {}).sort();
  const valutas = Object.keys(ord?.perValuta ?? {}).sort();
  const heeftOrders = oc.orders + ot.orders > 0;

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

      <div style={{ marginBottom: 18 }}>
        <Tabs
          value={tab}
          onChange={setTab}
          options={[
            { key: "verdict" as Tab, label: "Verdict" },
            { key: "orders" as Tab, label: "Orders", telling: oc.orders + ot.orders },
            { key: "segments" as Tab, label: "Segments" },
            ...(test.is_subscription ? [{ key: "forecast" as Tab, label: "Forecast" }] : []),
          ]}
        />
      </div>

      {tab === "forecast" ? (
        <ForecastView
          test={test}
          controlVisitors={c.visitors}
          testVisitors={t.visitors}
          controlOrders={oc}
          testOrders={ot}
        />
      ) : (
      <div className="stack stack--strak tabinhoud">
        {tab === "verdict" && (<>
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
              {c.rpv > 0 && (
                <span className="num" style={{ fontSize: 17, fontWeight: 600, color: "var(--ink-2)" }}>
                  {bedragVerschil(t.rpv - c.rpv)} per visitor
                </span>
              )}
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
                  {(() => {
                    /* A tiny difference needs an enormous sample, and printing
                       "1924 more days" reads as a broken number rather than as
                       the message it is: this difference is too small to prove.
                       Past six months the honest answer is to say so. */
                    if (!days || days <= 0 || smallest <= 0) return "Too early to estimate how long this needs.";
                    const nog = Math.ceil((target - smallest) / (smallest / days));
                    if (nog > 180) {
                      return "At this pace that is over six months — the difference is small enough that " +
                        "proving it costs more traffic than it is worth. Consider testing a bigger price gap.";
                    }
                    if (nog > 60) {
                      return "At this pace that is roughly " + Math.round(nog / 30) + " more months. " +
                        "Stopping earlier means deciding on noise.";
                    }
                    return "At this pace that is roughly " + nog + " more days. Stopping earlier means " +
                      "deciding on noise.";
                  })()}
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
        </div>

        <div className="grid grid--2">
          <Vergelijk
            label="Conversion"
            control={procent(c.cr)}
            test={procent(t.cr)}
            delta={convTest.lift}
            goedAls="geen"
            noot={convTest.bruikbaar
              ? pTekst(convTest.p) + " · a higher price nearly always lowers this; the question is whether revenue follows"
              : "Too few orders to compare yet."}
          />
          <Vergelijk
            label="Average order value"
            control={geld(c.aov)}
            test={geld(t.aov)}
            delta={c.aov ? ((t.aov - c.aov) / c.aov) * 100 : 0}
            noot={
              (c.aov ? bedragVerschil(t.aov - c.aov) + " per order · " : "") +
              heel(c.orders) + " versus " + heel(t.orders) + " orders"
            }
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

        </>)}

        {tab === "orders" && (<>
        <div className="grid grid--2">
          {/* ── funnel ─────────────────────────────────────────────────── */}
          <Card>
            <CardHead title="Funnel" sub="On the right, the share that made it from the previous step: control / test." />
            <div className="card__body">
              <div style={{ marginBottom: 16 }}><Legend /></div>
              {/* The cart step only appears when it is actually measured. This
                  store uses a JS cart, so no form submit fires and add-to-cart
                  stays at zero; a row of zeroes would read as "nobody adds to
                  cart" rather than "we do not know". */}
              <Trechter
                stappen={[
                  { label: "Visitors", control: c.visitors, test: t.visitors },
                  ...(c.atc + t.atc > 0
                    ? [{ label: "Added to cart", control: c.atc, test: t.atc }]
                    : []),
                  { label: "Orders", control: c.orders, test: t.orders },
                ]}
              />
              {c.atc + t.atc === 0 && (
                <p className="small muted" style={{ marginTop: 14 }}>
                  Add-to-cart is not measured on this theme: it adds to the cart with JavaScript,
                  so no form submit happens for the snippet to notice. Visitors and orders are
                  unaffected.
                </p>
              )}
            </div>
          </Card>

          {/* ── per group ──────────────────────────────────────────────── */}
          <Card>
            <CardHead title="Per group" />
            <div className="card__body card__body--flush table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Group</th><th>Visitors</th>
                    {c.atc + t.atc > 0 && <th>Cart</th>}
                    <th>Orders</th><th>Revenue</th><th>/ visitor</th>
                  </tr>
                </thead>
                <tbody>
                  {([["control", "Control", c], ["test", "Test", t]] as const).map(([k, label, g]) => (
                    <tr key={k}>
                      <td>
                        <span className="cell-series"><span className={"swatch swatch--" + k} />{label}</span>
                      </td>
                      <td>{heel(g.visitors)}</td>
                      {c.atc + t.atc > 0 && <td>{heel(g.atc)}</td>}
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

        {/* ── subscriptions ────────────────────────────────────────────── */}
        <div className="grid grid--2">
            <Card>
              <CardHead
                title="Subscription versus one-off"
                sub="At a higher price the first thing to give way is usually the commitment, not the purchase."
              />
              <div className="card__body">
                {!heeftOrders && (
                  <div style={{ marginBottom: 16 }}>
                    <Banner tone="info">
                      No orders yet. These numbers fill in from the orders webhook as soon as
                      someone buys — no extra setup needed.
                    </Banner>
                  </div>
                )}
                <div className="grid grid--2" style={{ gap: 14 }}>
                  {([["control", "Control", oc], ["test", "Test", ot]] as const).map(([k, label, o]) => (
                    <div key={k}>
                      <div className="legend__item" style={{ marginBottom: 8 }}>
                        <span className={"swatch swatch--" + k} />{label}
                      </div>
                      <p className="num" style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-.03em" }}>
                        {procent(subAandeel(o), 1)}
                      </p>
                      <p className="small muted" style={{ marginTop: 4 }}>
                        {heel(o.subOrders)} of {heel(o.orders)} orders
                      </p>
                      <div style={{ marginTop: 10 }}>
                        <Track
                          value={subAandeel(o) / 100}
                          color={k === "control" ? "var(--control)" : "var(--test)"}
                        />
                      </div>
                      <p className="small muted" style={{ marginTop: 8 }}>
                        {procent(subOmzetAandeel(o), 0)} of revenue
                      </p>
                    </div>
                  ))}
                </div>

                <hr className="rule" style={{ margin: "18px 0 14px" }} />

                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <Delta waarde={subToets.lift} />
                  <span className="small muted">
                    {subToets.bruikbaar
                      ? subToets.significant
                        ? "Solid — " + pTekst(subToets.p) + ". The test price genuinely shifts the mix."
                        : "Not solid yet — " + pTekst(subToets.p) + ". Could be chance."
                      : "Too few orders to compare yet."}
                  </span>
                </div>
              </div>
            </Card>

            <Card>
              <CardHead title="What an order looks like" sub="Same money can mean fewer units or a smaller bundle." />
              <div className="card__body card__body--flush table-scroll">
                <table>
                  <thead>
                    <tr><th>Group</th><th>Orders</th><th>Units</th><th>Units / order</th><th>Order value</th></tr>
                  </thead>
                  <tbody>
                    {([["control", "Control", oc, c], ["test", "Test", ot, t]] as const).map(
                      ([k, label, o, g]) => (
                        <tr key={k}>
                          <td>
                            <span className="cell-series"><span className={"swatch swatch--" + k} />{label}</span>
                          </td>
                          <td>{heel(o.orders)}</td>
                          <td>{heel(o.units)}</td>
                          <td>{o.orders ? (o.units / o.orders).toFixed(2) : "—"}</td>
                          <td><strong>{geld(g.aov)}</strong></td>
                        </tr>
                      ),
                    )}
                    {oc.orders > 0 && ot.orders > 0 && (
                      <tr>
                        <td className="muted">Difference</td>
                        <td className="muted">{ot.orders - oc.orders > 0 ? "+" : ""}{heel(ot.orders - oc.orders)}</td>
                        <td className="muted">{ot.units - oc.units > 0 ? "+" : ""}{heel(ot.units - oc.units)}</td>
                        <td className="muted">
                          {((ot.units / ot.orders) - (oc.units / oc.orders) > 0 ? "+" : "") +
                            ((ot.units / ot.orders) - (oc.units / oc.orders)).toFixed(2)}
                        </td>
                        <td><strong>{bedragVerschil(t.aov - c.aov)}</strong></td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
        </div>

        {/* ── tiers ────────────────────────────────────────────────────── */}
        {variantNamen.length > 0 && (
          <Card>
            <CardHead
              title="Which option they picked"
              sub="A tier priced the same in both groups is not part of the test — its orders add noise, not signal. This is where you see how much volume goes there."
            />
            <div className="card__body card__body--flush table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Option</th><th>Orders control</th><th>Share</th>
                    <th>Orders test</th><th>Share</th><th>Revenue test</th>
                  </tr>
                </thead>
                <tbody>
                  {variantNamen.map((naam) => {
                    const paar = ord?.perVariant?.[naam];
                    const rc = paar?.control, rt = paar?.test;
                    const oc2 = Number(rc?.orders || 0), ot2 = Number(rt?.orders || 0);
                    return (
                      <tr key={naam}>
                        <td>{naam}</td>
                        <td>{heel(oc2)}</td>
                        <td>{oc.orders ? procent((oc2 / oc.orders) * 100, 0) : "—"}</td>
                        <td>{heel(ot2)}</td>
                        <td>{ot.orders ? procent((ot2 / ot.orders) * 100, 0) : "—"}</td>
                        <td>{geld(Number(rt?.revenueCents || 0) / 100)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        </>)}

        {tab === "segments" && (<>
        {/* ── per currency ─────────────────────────────────────────────── */}
        {valutas.length > 0 && (
          <Card>
            <CardHead
              title="Per currency"
              sub="Each market prices in its own currency, so this is the market split."
            />
            <div className="card__body card__body--flush table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Currency</th>
                    <th>Orders <span className="muted">control</span></th>
                    <th>Orders <span className="muted">test</span></th>
                    <th>Order value <span className="muted">control</span></th>
                    <th>Order value <span className="muted">test</span></th>
                    <th>Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {valutas.map((v) => {
                    const paar = ord?.perValuta?.[v];
                    const gc = paar?.control ?? GEEN;
                    const gt = paar?.test ?? GEEN;
                    const aovC = gc.orders ? gc.revenueCents / 100 / gc.orders : 0;
                    const aovT = gt.orders ? gt.revenueCents / 100 / gt.orders : 0;
                    // Under ten orders a percentage is theatre, so it is not shown.
                    const genoeg = gc.orders >= 10 && gt.orders >= 10;
                    return (
                      <tr key={v}>
                        <td>{v}</td>
                        <td>{heel(gc.orders)}</td>
                        <td>{heel(gt.orders)}</td>
                        <td>{gc.orders ? geld(aovC) : "—"}</td>
                        <td>{gt.orders ? geld(aovT) : "—"}</td>
                        <td>
                          {genoeg && aovC > 0
                            ? <Delta waarde={((aovT - aovC) / aovC) * 100} />
                            : <span className="muted small">too few orders</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
        {/* Visitors still come from our own measurement, and those do carry a
           market handle. Kept separate rather than merged, because mixing a
           market-based count with a currency-based one in one table invites
           exactly the wrong comparison. */}
        {markets.length > 0 && (
          <Card>
            <CardHead title="Visitors per market" sub="From our own measurement on the storefront." />
            <div className="card__body card__body--flush table-scroll">
              <table>
                <thead><tr><th>Market</th><th>Control</th><th>Test</th><th>Split</th></tr></thead>
                <tbody>
                  {markets.map((m) => {
                    const rows = (co: string) =>
                      ownStats.filter((r) => (r.market || "—") === m && r.cohort === co);
                    const gc = telOp(rows("control"), "control");
                    const gt = telOp(rows("test"), "test");
                    const tot = gc.visitors + gt.visitors;
                    return (
                      <tr key={m}>
                        <td>{m}</td>
                        <td>{heel(gc.visitors)}</td>
                        <td>{heel(gt.visitors)}</td>
                        <td>{tot ? procent((gt.visitors / tot) * 100, 0) + " test" : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {ord && (ord.rebillsOvergeslagen > 0 || ord.ongetagd > 0 || ord.afgekapt) && (
          <Banner tone="info">
            {ord.rebillsOvergeslagen > 0 && (
              <>
                <strong>{heel(ord.rebillsOvergeslagen)} subscription renewals excluded.</strong>{" "}
                A renewal was agreed months ago and says nothing about the price being tested. The
                original has an existing subscriber base and the duplicate does not, so counting
                them would hand the control group orders the test group can never have.
              </>
            )}
            {ord.ongetagd > 0 && (
              <>
                {" "}<strong>{heel(ord.ongetagd)} orders without a group tag</strong> were left out: they
                were placed without passing the tested product page, so there is no visit to
                compare them against.
              </>
            )}
            {ord.afgekapt && " Order history was truncated at the page limit, so these numbers are incomplete."}
          </Banner>
        )}
        </>)}
      </div>
      )}
    </main>
  );
}
