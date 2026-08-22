import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import { useState } from "react";
import supabase from "~/db.server";
import { configProbleem, vereisLogin, winkelDomein } from "~/lib/dashboardAuth.server";
import { loadTests, type PriceTest } from "~/lib/priceTest.server";

type StatRij = {
  test_id: number; cohort: string; market: string | null;
  views: number; add_to_carts: number; orders: number;
  revenue_cents: number; visitors: number;
};

type DagRij = {
  test_id: number; cohort: string; dag: string;
  views: number; add_to_carts: number; orders: number;
  revenue_cents: number; visitors: number;
};

export const meta = () => [{ title: "Analytics · Price Test" }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await vereisLogin(request);

  // Instelfouten als gegeven teruggeven in plaats van als uitzondering. Een
  // ontbrekende variabele hoort een leesbare melding te worden; gooien levert
  // een leeg foutscherm op waar niemand iets aan afleest.
  const probleem = configProbleem();
  if (probleem) return json({ shop: null, tests: [], stats: [], daily: [], fout: probleem });

  const shop = await winkelDomein();
  if (!shop) return json({ shop: null, tests: [], stats: [], daily: [], fout: null });

  try {
    const [tests, stats, daily] = await Promise.all([
      loadTests(shop),
      supabase.from("price_test_stats").select("*").eq("shop", shop),
      supabase.from("price_test_daily").select("*").eq("shop", shop).order("dag"),
    ]);
    return json({
      shop,
      tests,
      stats: (stats.data || []) as StatRij[],
      daily: (daily.data || []) as DagRij[],
      fout: null,
    });
  } catch (e: any) {
    return json({ shop, tests: [], stats: [], daily: [], fout: e?.message ?? "Databasefout" });
  }
};

/* --------------------------------------------------------------- helpers */

/**
 * Omzet per bezoeker is de maat die telt.
 *
 * Conversie alleen misleidt bij een prijstest: een hogere prijs verlaagt de
 * conversie bijna altijd terwijl de omzet kan stijgen, en andersom kan een
 * lagere prijs beter converteren en toch minder opleveren. Daarom staat omzet
 * per bezoeker overal vooraan en is conversie ondersteunend.
 */
function perBezoeker(cents: number, visitors: number) {
  return visitors ? cents / 100 / visitors : 0;
}

const geld = (n: number) =>
  n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const heel = (n: number) => n.toLocaleString("nl-NL");
const pct = (n: number) =>
  n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
/* Verschillen krijgen een decimaal; twee suggereert een precisie die de
   steekproef niet heeft. */
const pct1 = (n: number) =>
  n.toLocaleString("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";

function korteDatum(d: string) {
  const dt = new Date(d);
  return dt.toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

/* ----------------------------------------------------------------- chart */

type Punt = { dag: string; control: number; test: number };

function Lijngrafiek({ punten }: { punten: Punt[] }) {
  const [hover, setHover] = useState<number | null>(null);

  if (punten.length < 2) {
    return <div className="empty-chart">Nog te weinig dagen om een verloop te tonen.</div>;
  }

  const W = 760, H = 240;
  const pad = { top: 16, right: 18, bottom: 28, left: 52 };
  const iw = W - pad.left - pad.right;
  const ih = H - pad.top - pad.bottom;

  const maxY = Math.max(...punten.flatMap((p) => [p.control, p.test]), 0.01) * 1.15;
  const x = (i: number) => pad.left + (i / (punten.length - 1)) * iw;
  const y = (v: number) => pad.top + ih - (v / maxY) * ih;

  const pad2 = (key: "control" | "test") =>
    punten.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p[key]).toFixed(1)).join(" ");

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxY);
  const labelStap = Math.ceil(punten.length / 7);

  return (
    <div style={{ position: "relative" }}>
      <svg
        className="chart"
        viewBox={"0 0 " + W + " " + H}
        role="img"
        aria-label="Omzet per bezoeker per dag, controlegroep tegenover testgroep"
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
            <line className="grid" x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} />
            <text className="axis-label" x={pad.left - 8} y={y(t) + 3.5} textAnchor="end">
              {geld(t)}
            </text>
          </g>
        ))}

        {punten.map((p, i) =>
          i % labelStap === 0 ? (
            <text key={i} className="axis-label" x={x(i)} y={H - 9} textAnchor="middle">
              {korteDatum(p.dag)}
            </text>
          ) : null,
        )}

        {hover !== null && (
          <line className="grid" x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + ih} />
        )}

        <path className="series-line" d={pad2("control")} stroke="var(--series-control)" />
        <path className="series-line" d={pad2("test")} stroke="var(--series-test)" />

        {hover !== null && (
          <>
            <circle className="series-dot" cx={x(hover)} cy={y(punten[hover].control)} r={5}
              fill="var(--series-control)" />
            <circle className="series-dot" cx={x(hover)} cy={y(punten[hover].test)} r={5}
              fill="var(--series-test)" />
          </>
        )}
      </svg>

      {hover !== null && (
        <div
          style={{
            position: "absolute",
            left: "calc(" + ((x(hover) / W) * 100).toFixed(2) + "% + 12px)",
            top: 8,
            pointerEvents: "none",
            background: "var(--surface-1)",
            border: "1px solid var(--border-strong)",
            borderRadius: 8,
            padding: "9px 11px",
            boxShadow: "var(--shadow)",
            fontSize: 12.5,
            whiteSpace: "nowrap",
            transform: hover > punten.length / 2 ? "translateX(-100%) translateX(-24px)" : "none",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 5 }}>{korteDatum(punten[hover].dag)}</div>
          <div className="legend__item">
            <span className="swatch swatch--control" /> Controle {geld(punten[hover].control)}
          </div>
          <div className="legend__item">
            <span className="swatch swatch--test" /> Test {geld(punten[hover].test)}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ page */

export default function Analytics() {
  const { shop, tests, stats, daily, fout } = useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();

  if (fout || !shop) {
    return (
      <main className="page">
        <h1>Analytics</h1>
        {fout ? (
          <div className="banner banner--error" style={{ marginTop: 16 }}>
            <strong>Configuratie niet compleet.</strong>
            <div style={{ marginTop: 6 }}><code>{fout}</code></div>
            <div style={{ marginTop: 8 }}>
              Zet deze in Vercel onder Settings → Environment Variables en deploy daarna
              opnieuw — Vercel neemt nieuwe variabelen niet mee in een bestaande build.
            </div>
          </div>
        ) : (
          <div className="banner banner--warn" style={{ marginTop: 16 }}>
            <strong>Nog geen winkel gekoppeld.</strong> Installeer de app in Shopify; daarna
            verschijnen hier de cijfers.
          </div>
        )}
      </main>
    );
  }

  const gekozenId = Number(params.get("test")) || tests[0]?.id;
  const test = (tests as PriceTest[]).find((t) => t.id === gekozenId);

  const eigenStats = (stats as StatRij[]).filter((r) => r.test_id === gekozenId);
  const eigenDaily = (daily as DagRij[]).filter((r) => r.test_id === gekozenId);

  const groep = (c: "control" | "test") => {
    const g = eigenStats.filter((r) => r.cohort === c);
    const som = (k: keyof StatRij) => g.reduce((a, r) => a + (Number(r[k]) || 0), 0);
    const visitors = som("visitors");
    const revenue = som("revenue_cents");
    const orders = som("orders");
    return {
      visitors, orders, atc: som("add_to_carts"), revenue,
      rpv: perBezoeker(revenue, visitors),
      cr: visitors ? (orders / visitors) * 100 : 0,
      aov: orders ? revenue / 100 / orders : 0,
    };
  };

  const c = groep("control");
  const t = groep("test");
  const verschil = c.rpv > 0 ? ((t.rpv - c.rpv) / c.rpv) * 100 : 0;
  const genoeg = c.visitors >= 300 && t.visitors >= 300;

  const dagen = Array.from(new Set(eigenDaily.map((r) => r.dag))).sort();
  const punten: Punt[] = dagen.map((d) => {
    const rij = (co: string) => eigenDaily.find((r) => r.dag === d && r.cohort === co);
    const rc = rij("control"), rt = rij("test");
    return {
      dag: d,
      control: perBezoeker(Number(rc?.revenue_cents || 0), Number(rc?.visitors || 0)),
      test: perBezoeker(Number(rt?.revenue_cents || 0), Number(rt?.visitors || 0)),
    };
  });

  const markten = Array.from(new Set(eigenStats.map((r) => r.market || "—"))).sort();

  return (
    <main className="page">
      <div className="page__head">
        <div>
          <h1>Analytics</h1>
          <p className="sub">
            {test ? test.control_title || test.control_product_id : "Nog geen test aangemaakt"}
          </p>
        </div>
        {tests.length > 1 && (
          <div style={{ minWidth: 240 }}>
            <label htmlFor="testkeuze">Test</label>
            <select
              id="testkeuze"
              value={String(gekozenId)}
              onChange={(e) => setParams({ test: e.target.value })}
            >
              {(tests as PriceTest[]).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.control_title || x.control_product_id} ({x.status})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {!test && (
        <div className="banner">
          Maak eerst een test aan onder <a href="/dashboard/tests">Tests</a>.
        </div>
      )}

      {test && (
        <>
          <div className={"banner " + (genoeg ? (verschil >= 0 ? "banner--ok" : "banner--error") : "banner--warn")}>
            {genoeg ? (
              <>
                De testprijs levert <strong>{verschil >= 0 ? "+" : ""}{pct1(verschil)}</strong>{" "}
                omzet per bezoeker op. Dat is de uitslag; conversie is context.
              </>
            ) : (
              <>
                <strong>Nog te weinig bezoekers om iets te concluderen.</strong> Controle{" "}
                {heel(c.visitors)}, test {heel(t.visitors)} — reken op een paar honderd per groep
                voordat een verschil betekenis heeft.
              </>
            )}
          </div>

          <div className="tiles">
            <div className="tile">
              <div className="tile__label"><span className="swatch swatch--control" />Omzet / bezoeker — controle</div>
              <div className="tile__value">{geld(c.rpv)}</div>
              <div className="tile__note">{heel(c.visitors)} bezoekers · {heel(c.orders)} orders</div>
            </div>
            <div className="tile">
              <div className="tile__label"><span className="swatch swatch--test" />Omzet / bezoeker — test</div>
              <div className="tile__value">{geld(t.rpv)}</div>
              <div className="tile__note">{heel(t.visitors)} bezoekers · {heel(t.orders)} orders</div>
            </div>
            <div className="tile">
              <div className="tile__label">Verschil</div>
              <div className="tile__value">
                <span className={"delta " + (verschil >= 0 ? "delta--up" : "delta--down")}>
                  {verschil >= 0 ? "▲" : "▼"} {pct1(Math.abs(verschil))}
                </span>
              </div>
              <div className="tile__note">omzet per bezoeker</div>
            </div>
            <div className="tile">
              <div className="tile__label">Gemiddelde orderwaarde</div>
              <div className="tile__value">{geld(t.aov)}</div>
              <div className="tile__note">controle {geld(c.aov)}</div>
            </div>
          </div>

          <div className="card">
            <div className="card__head">
              <h2>Omzet per bezoeker per dag</h2>
              <div className="legend">
                <span className="legend__item"><span className="swatch swatch--control" />Controle</span>
                <span className="legend__item"><span className="swatch swatch--test" />Test</span>
              </div>
            </div>
            <div className="card__body">
              <Lijngrafiek punten={punten} />
              {punten.length >= 2 && (
                <details style={{ marginTop: 14 }}>
                  <summary className="muted" style={{ cursor: "pointer", fontSize: 12.5 }}>
                    Cijfers als tabel
                  </summary>
                  <div className="table-scroll" style={{ marginTop: 10 }}>
                    <table>
                      <thead>
                        <tr><th>Dag</th><th>Controle</th><th>Test</th></tr>
                      </thead>
                      <tbody>
                        {punten.map((p) => (
                          <tr key={p.dag}>
                            <td>{korteDatum(p.dag)}</td>
                            <td>{geld(p.control)}</td>
                            <td>{geld(p.test)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card__head"><h2>Per groep</h2></div>
            <div className="card__body card__body--flush table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Groep</th><th>Bezoekers</th><th>Add to cart</th>
                    <th>Orders</th><th>Conversie</th><th>Omzet</th><th>Omzet / bezoeker</th>
                  </tr>
                </thead>
                <tbody>
                  {([["control", "Controle — huidige prijs", c], ["test", "Test — nieuwe prijs", t]] as const).map(
                    ([key, label, g]) => (
                      <tr key={key}>
                        <td>
                          <span className="cell-series">
                            <span className={"swatch swatch--" + key} />{label}
                          </span>
                        </td>
                        <td>{heel(g.visitors)}</td>
                        <td>{heel(g.atc)}</td>
                        <td>{heel(g.orders)}</td>
                        <td>{pct(g.cr)}</td>
                        <td>{geld(g.revenue / 100)}</td>
                        <td>{geld(g.rpv)}</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {markten.length > 0 && (
            <div className="card">
              <div className="card__head"><h2>Per markt</h2></div>
              <div className="card__body card__body--flush table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Markt</th><th>Bezoekers controle</th><th>Omzet / bez. controle</th>
                      <th>Bezoekers test</th><th>Omzet / bez. test</th><th>Verschil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {markten.map((m) => {
                      const rij = (co: string) =>
                        eigenStats.find((r) => (r.market || "—") === m && r.cohort === co);
                      const rc = rij("control"), rt = rij("test");
                      const rpvC = perBezoeker(Number(rc?.revenue_cents || 0), Number(rc?.visitors || 0));
                      const rpvT = perBezoeker(Number(rt?.revenue_cents || 0), Number(rt?.visitors || 0));
                      const d = rpvC > 0 ? ((rpvT - rpvC) / rpvC) * 100 : 0;
                      return (
                        <tr key={m}>
                          <td>{m}</td>
                          <td>{heel(Number(rc?.visitors || 0))}</td>
                          <td>{geld(rpvC)}</td>
                          <td>{heel(Number(rt?.visitors || 0))}</td>
                          <td>{geld(rpvT)}</td>
                          <td>
                            {rpvC > 0 ? (
                              <span className={"delta " + (d >= 0 ? "delta--up" : "delta--down")}>
                                {d >= 0 ? "▲" : "▼"} {pct1(Math.abs(d))}
                              </span>
                            ) : <span className="muted">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
