import { Banner, Card, CardHead, Delta, Leeg, Vergelijk } from "~/components/ui";
import { Drempel } from "~/components/charts";
import { bedragVerschil, geld, heel, ondertekend, procent } from "~/lib/analytics";
import { forecast, forecastTekst } from "~/lib/forecast";
import type { OrderCijfers } from "~/lib/orders.server";
import type { PriceTest } from "~/lib/priceTest.server";

/**
 * What the price does over a customer's lifetime.
 *
 * Separate from the results tab on purpose. Everything here is arithmetic on an
 * assumption you typed in, and mixing that into the measured numbers would let
 * a projection be mistaken for a finding. Same reason the wording stays hedged
 * throughout: this is a model, not an observation.
 */
export function ForecastView({
  test, controlVisitors, testVisitors, controlOrders, testOrders,
}: {
  test: PriceTest;
  controlVisitors: number;
  testVisitors: number;
  controlOrders: OrderCijfers;
  testOrders: OrderCijfers;
}) {
  const cycles = Number(test.avg_cycles ?? 0);

  if (!test.is_subscription || cycles < 1) {
    return (
      <Card>
        <Leeg>
          <div style={{ maxWidth: 420 }}>
            <strong style={{ display: "block", marginBottom: 8, color: "var(--ink)" }}>
              Lifetime forecast is off for this test
            </strong>
            A test measures the first order. For a subscription product that is the smaller half
            of the answer: a customer paying more per cycle is worth more every cycle, so a price that
            loses a little conversion can still win by a distance.
            <br /><br />
            Turn it on under Tests and enter how many billing cycles an average customer lasts.
          </div>
        </Leeg>
      </Card>
    );
  }

  const f = forecast(
    { visitors: controlVisitors, orders: controlOrders, cycles },
    { visitors: testVisitors, orders: testOrders, cycles },
  );

  const genoeg = controlOrders.orders >= 10 && testOrders.orders >= 10;

  return (
    <div className="stack">
      <Banner tone="info">
        <strong>These are projections, not measurements.</strong> They rest on your assumption of{" "}
        {cycles.toFixed(1)} billing cycles per customer. Whether the higher price actually changes
        how long people stay is something only months of data can tell you — the break-even below
        is the honest way to reason about it in the meantime.
      </Banner>

      <Card>
        <CardHead
          title="Lifetime value per visitor"
          sub="First-order revenue multiplied out over the assumed lifetime, spread across every visitor."
        />
        <div className="card__body">
          <div className="rij" style={{ marginBottom: 16 }}>
            <span className="cijfer">
              {ondertekend(f.verschilPct)}
            </span>
            <span className="cijfer cijfer--sm">
              {bedragVerschil(f.verschilPerBezoeker)} per visitor
            </span>
          </div>

          <div className="grid grid--2">
            <Vergelijk
              label="Lifetime value per visitor"
              control={geld(f.control.ltvPerBezoeker)}
              test={geld(f.test.ltvPerBezoeker)}
              delta={f.verschilPct}
              ruw={{ control: f.control.ltvPerBezoeker, test: f.test.ltvPerBezoeker }}
              noot={"First order alone: " + geld(f.control.eersteOrderPerBezoeker) + " versus " +
                    geld(f.test.eersteOrderPerBezoeker)}
            />
            <Vergelijk
              label="Value per customer"
              control={geld(f.control.ltvPerKlant)}
              test={geld(f.test.ltvPerKlant)}
              ruw={{ control: f.control.ltvPerKlant, test: f.test.ltvPerKlant }}
              delta={f.control.ltvPerKlant ? ((f.test.ltvPerKlant - f.control.ltvPerKlant) / f.control.ltvPerKlant) * 100 : 0}
              noot={procent(f.control.subAandeel * 100, 0) + " versus " +
                    procent(f.test.subAandeel * 100, 0) + " on a subscription"}
            />
          </div>
        </div>
      </Card>

      {/* ── the number that actually decides it ───────────────────────────── */}
      <Card>
        <CardHead
          title="How much retention the variant can afford to lose"
          sub="A test that runs for weeks cannot measure what happens over months. It can tell you where the line sits, which is enough to decide with."
        />
        <div className="card__body">
          {f.omslagCycles === null ? (
            <Leeg>No subscription orders in the test group yet, so there is no lifetime to project.</Leeg>
          ) : (
            <>
              <div className="rij rij--ruim" style={{ marginBottom: 20 }}>
                <div>
                  <span className="cijferlabel">Break-even lifetime</span>
                  <p className="cijfer cijfer--mid">
                    {f.omslagCycles.toFixed(1)}
                  </p>
                  <span className="cijferlabel" style={{ marginTop: 4, marginBottom: 0 }}>cycles</span>
                </div>
                <div>
                  <span className="cijferlabel">You assume</span>
                  <p className="cijfer cijfer--mid">
                    {cycles.toFixed(1)}
                  </p>
                  <span className="cijferlabel" style={{ marginTop: 4, marginBottom: 0 }}>cycles</span>
                </div>
                {f.margeOpRetentie !== null && (
                  <div style={{ marginLeft: "auto", textAlign: "right" }}>
                    <span className="cijferlabel">Room to lose retention</span>
                    <div style={{ marginTop: 8 }}>
                      <Delta waarde={f.margeOpRetentie} />
                    </div>
                  </div>
                )}
              </div>

              {/* De twee getallen hierboven zeggen alles, maar dwingen je het
                  verschil zelf uit te rekenen en ook nog te bedenken welke
                  kant goed is. Op een as zie je het in één blik: staat de
                  ruit rechts van de streep, dan verdient de variant zichzelf
                  terug over de aangenomen levensduur.

                  De balk die hier stond toonde de marge als percentage van
                  honderd, en die honderd betekende niets - een marge van 40%
                  vulde de balk voor twee vijfde zonder dat er iets was waar
                  dat tegen afgezet werd. */}
              <Drempel
                omslag={f.omslagCycles}
                aanname={cycles}
                eenheid="cycles"
                label={"Break-even at " + f.omslagCycles.toFixed(1) + " cycles; you assume " +
                       cycles.toFixed(1) + ". " +
                       (cycles >= f.omslagCycles
                         ? "The variant pays for itself over the assumed lifetime."
                         : "The variant does not pay for itself over the assumed lifetime.")}
              />

              <p style={{ marginTop: 16, fontSize: 13, color: "var(--ink-2)" }}>
                {forecastTekst(f, cycles)}
              </p>
            </>
          )}
        </div>
      </Card>

      {!genoeg && (
        <Banner tone="warn">
          <strong>Fewer than ten orders in one of the groups.</strong> The projection multiplies
          whatever it is given, so with these numbers it multiplies noise. Treat it as a shape, not
          a figure.
        </Banner>
      )}

      <Card>
        <CardHead title="How this is calculated" sub="So you can check it rather than trust it." />
        <div className="card__body">
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Step</th><th>Control</th><th>Test</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>Visitors</td>
                  <td>{heel(f.control.visitors)}</td>
                  <td>{heel(f.test.visitors)}</td>
                </tr>
                <tr>
                  <td>Orders</td>
                  <td>{heel(f.control.orders)}</td>
                  <td>{heel(f.test.orders)}</td>
                </tr>
                <tr>
                  <td>Average first order</td>
                  <td>{geld(f.control.aov)}</td>
                  <td>{geld(f.test.aov)}</td>
                </tr>
                <tr>
                  <td>Share on a subscription</td>
                  <td>{procent(f.control.subAandeel * 100, 0)}</td>
                  <td>{procent(f.test.subAandeel * 100, 0)}</td>
                </tr>
                <tr>
                  <td>Value per customer</td>
                  <td>{geld(f.control.ltvPerKlant)}</td>
                  <td>{geld(f.test.ltvPerKlant)}</td>
                </tr>
                <tr>
                  <td><strong>Value per visitor</strong></td>
                  <td><strong>{geld(f.control.ltvPerBezoeker)}</strong></td>
                  <td><strong>{geld(f.test.ltvPerBezoeker)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="small muted" style={{ marginTop: 16 }}>
            A one-off buyer counts once; a subscriber counts {cycles.toFixed(1)} times. The two are
            blended by the share of orders actually on a selling plan, so if the higher price pushes
            people away from subscribing, that shows up here rather than being assumed away.
          </p>
        </div>
      </Card>
    </div>
  );
}
