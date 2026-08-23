import { useSearchParams } from "@remix-run/react";
import { PageHead } from "~/components/shell";
import { Lijn } from "~/components/charts";
import { Banner, Card, CardHead, Delta, Kpi, Leeg, Segmented, Track,
         IconUsers, IconCart, IconChart, IconCoins } from "~/components/ui";
import { heel, procent } from "~/lib/analytics";
import type { SiteBereik, SiteData, SiteRij } from "~/lib/site.server";

/**
 * Bezoekers van de hele winkel, los van de tests.
 *
 * WAAROM DIT NAAST DE TESTEN STAAT EN NIET ERIN
 * Een test beantwoordt "wint deze variant". Dit beantwoordt "wat gebeurt er
 * eigenlijk". Dat zijn andere vragen met andere aantallen - het merendeel van
 * je verkeer komt nooit in de buurt van een geteste pagina - en ze door elkaar
 * halen levert cijfers op die geen van beide vragen beantwoorden.
 *
 * WAT HIER NIET IN ZIT
 * Geen sessieopnames en geen heatmaps. Dat is een ander soort gereedschap met
 * een ander soort opslag, en op deze winkel draait daar al iets voor.
 */

/**
 * Verschil met de vorige periode, of niets.
 *
 * Niets tonen als er geen vergelijkbare vorige periode is. Een pijl bij een
 * winkel die net begonnen is met meten suggereert een trend die er niet is.
 */
function Verschilpil({ nu, toen, omlaagIsGoed }: {
  nu: number; toen?: number | null; omlaagIsGoed?: boolean;
}) {
  if (toen === null || toen === undefined || !toen) return null;
  return <Delta waarde={((nu - toen) / toen) * 100} goedAls={omlaagIsGoed ? "down" : "up"} />;
}

const seconden = (ms: number) => {
  const s = Math.round(ms / 1000);
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60);
  return m + "m " + String(s % 60).padStart(2, "0") + "s";
};

/** Lijstje met een balk erachter, zodat de verhouding te zien is zonder rekenen. */
function Lijstje({ titel, sub, rijen, leeg }: {
  titel: string; sub: string; rijen: SiteRij[]; leeg: string;
}) {
  const top = rijen[0]?.aantal || 1;
  return (
    <Card>
      <CardHead title={titel} sub={sub} />
      <div className="card__body card__body--flush">
        {!rijen.length ? <Leeg>{leeg}</Leeg> : (
          <div className="balklijst">
            {rijen.map((r) => (
              <div className="balkrij" key={r.naam}>
                <span className="balkrij__vulling" style={{ width: (r.aantal / top) * 100 + "%" }} />
                <span className="balkrij__naam">{r.naam}</span>
                <span className="balkrij__aantal num">{heel(r.aantal)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

export function SiteView({ data, shop }: { data: SiteData; shop: string | null }) {
  const [params, setParams] = useSearchParams();
  const bereik = (params.get("d") as SiteBereik) || "7";
  const zet = (d: SiteBereik) => setParams({ d }, { replace: true });

  const k = data.kern;
  const v = data.vorige;
  const bounce = k.sessies ? (k.bounces / k.sessies) * 100 : 0;
  const vorigeBounce = v?.sessies ? (v.bounces / v.sessies) * 100 : null;
  const duur = k.sessies ? k.duurMs / k.sessies : 0;
  const vorigeDuur = v?.sessies ? v.duurMs / v.sessies : null;
  const perSessie = k.sessies ? k.pageviews / k.sessies : 0;

  /**
   * De trechter door de winkel.
   *
   * Elke stap telt sessies die die stap hebben gehaald, niet die er precies
   * doorheen liepen: iemand die vanuit een advertentie direct op een product
   * landt heeft geen collectie gezien, en die eruit gooien zou de trechter
   * smaller maken dan de werkelijkheid.
   */
  const stappen = [
    { label: "Sessions", n: k.sessies },
    { label: "Saw a collection", n: k.zagCollectie },
    { label: "Saw a product", n: k.zagProduct },
    { label: "Reached the cart", n: k.zagCart },
    { label: "Reached checkout", n: k.zagCheckout },
  ];

  /**
   * Elke stap als aandeel van álle sessies, niet van de stap erboven.
   *
   * Dat laatste leverde "189% of previous" op, en een trechter boven de
   * honderd procent leest als een bug. Terecht ook: dit is geen volgorde.
   * Meer mensen zien een product dan een collectie, omdat advertenties direct
   * op een product landen. Als aandeel van het totaal klopt elk cijfer wél,
   * en het beantwoordt dezelfde vraag.
   *
   * De echte volgorde zit alleen in product → cart → checkout, en dáár is de
   * grootste val het interessante getal.
   */
  const echteVolgorde = [
    { naam: "Saw a product", n: k.zagProduct },
    { naam: "Reached the cart", n: k.zagCart },
    { naam: "Reached checkout", n: k.zagCheckout },
  ];
  let grootsteVal: { van: string; naar: string; behouden: number } | null = null;
  for (let i = 1; i < echteVolgorde.length; i++) {
    const van = echteVolgorde[i - 1];
    const naar = echteVolgorde[i];
    if (!van.n) continue;
    const behouden = naar.n / van.n;
    if (!grootsteVal || behouden < grootsteVal.behouden) {
      grootsteVal = { van: van.naam.toLowerCase(), naar: naar.naam.toLowerCase(), behouden };
    }
  }

  return (
    <main className="page">
      <PageHead
        titel="Visitors"
        sub="Everyone on the storefront, whether or not they are in a test."
        actie={
          <div className="rij rij--mid">
            {data.nu > 0 && (
              <span className="live">
                <span className="live__stip" />
                {heel(data.nu)} online now
              </span>
            )}
            <Segmented
              value={bereik}
              options={[
                { key: "1" as SiteBereik, label: "Today" },
                { key: "7" as SiteBereik, label: "7 days" },
                { key: "30" as SiteBereik, label: "30 days" },
                { key: "90" as SiteBereik, label: "90 days" },
              ]}
              onChange={zet}
            />
          </div>
        }
      />

      <div className="stack">
        {!k.sessies && (
          <Card>
            <Leeg>
              <div style={{ maxWidth: 420 }}>
                <strong style={{ display: "block", marginBottom: 8, color: "var(--ink)" }}>
                  Nothing measured yet
                </strong>
                Visitor tracking rides along with the Experli snippet in your theme. If you have
                just added it, the first numbers appear within a minute of the next visitor.
              </div>
            </Leeg>
          </Card>
        )}

        {k.sessies > 0 && (
          <>
            <div className="grid grid--4">
              <Kpi icon={<IconUsers />} tone="control" label="Visitors"
                   value={heel(k.bezoekers)}
                   note={heel(k.nieuweBezoekers) + " new"}
                   delta={<Verschilpil nu={k.bezoekers} toen={v?.bezoekers} />} />
              <Kpi icon={<IconChart />} tone="neutral" label="Pageviews"
                   value={heel(k.pageviews)}
                   note={perSessie.toFixed(1) + " per session"}
                   delta={<Verschilpil nu={k.pageviews} toen={v?.pageviews} />} />
              <Kpi icon={<IconCart />} tone="neutral" label="Bounce rate"
                   value={procent(bounce, 0)}
                   note="left after one page"
                   delta={<Verschilpil nu={bounce} toen={vorigeBounce} omlaagIsGoed />} />
              <Kpi icon={<IconCoins />} tone="test" label="Time on site"
                   value={seconden(duur)}
                   note="per session, average"
                   delta={<Verschilpil nu={duur} toen={vorigeDuur} />} />
            </div>

            <Card>
              <CardHead
                title="Where visitors drop off"
                sub="Each step counts sessions that reached it, not ones that walked through in order — someone landing straight on a product from an ad never sees a collection."
              />
              <div className="card__body">
                {stappen.map((s, i) => {
                  const deel = k.sessies ? s.n / k.sessies : 0;
                  return (
                    <div className="stapregel" key={s.label}>
                      <div className="stapregel__kop">
                        <span className="stapregel__naam">{s.label}</span>
                        <span className="stapregel__cijfers num">
                          <strong>{heel(s.n)}</strong>
                          {i > 0 && (
                            <span className={deel < 0.2 ? "stapregel__val" : "muted"}>
                              {procent(deel * 100, 0)} of sessions
                            </span>
                          )}
                        </span>
                      </div>
                      <Track value={deel} color={i === 0 ? "var(--control)" : "var(--iris-lit)"} />
                    </div>
                  );
                })}

                {grootsteVal && (
                  <p className="small muted" style={{ marginTop: 16 }}>
                    The steepest fall is between <strong>{grootsteVal.van}</strong> and{" "}
                    <strong>{grootsteVal.naar}</strong>: {procent(grootsteVal.behouden * 100, 0)} of
                    the people who got that far carried on.
                  </p>
                )}
              </div>
            </Card>

            {data.perDag.length > 1 && (
              <Card>
                <CardHead title="Over time" sub="Visitors per day." />
                <div className="card__body">
                  <Lijn
                    punten={data.perDag.map((p) => ({
                      dag: p.dag, control: p.bezoekers, test: p.pageviews,
                    }))}
                    formatteer={heel}
                  />
                </div>
              </Card>
            )}

            <Card>
              <CardHead
                title="Pages"
                sub="Entries are sessions that started here; exits are sessions that ended here. Time is measured on the page they left from."
              />
              <div className="card__body card__body--flush table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Page</th><th>Views</th><th>Entries</th><th>Exits</th><th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.paginas.map((p) => (
                      <tr key={p.path}>
                        <td><code>{p.path}</code></td>
                        <td>{heel(p.pageviews)}</td>
                        <td>{heel(p.instappen)}</td>
                        <td>{heel(p.uitstappen)}</td>
                        <td>{p.gemSec ? seconden(p.gemSec * 1000) : <span className="muted">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <div className="grid grid--3">
              <Lijstje titel="Where they come from"
                       sub="UTM source when there is one, otherwise the referring site."
                       rijen={data.bronnen} leeg="No sources yet." />
              <Lijstje titel="Countries" sub="From Shopify's own localisation, so the same country your prices run on."
                       rijen={data.landen} leeg="No countries yet." />
              <Lijstje titel="Devices" sub="From the screen width, not the user agent."
                       rijen={data.devices} leeg="No devices yet." />
              <Lijstje titel="Browsers" sub="Reported by the browser itself where it can be asked."
                       rijen={data.browsers} leeg="No browsers yet." />
              <Lijstje titel="Operating systems" sub="Worth watching when something breaks on one and not the other."
                       rijen={data.besturing} leeg="No systems yet." />
              <Lijstje titel="Screen widths"
                       sub="In buckets, not exact pixels — the question is whether the layout holds up, not which handset."
                       rijen={data.schermen} leeg="No screen sizes yet." />
              <Lijstje titel="Languages" sub="Browser language, without the region: nl-BE and nl-NL answer the same question."
                       rijen={data.talen} leeg="No languages yet." />
            </div>

            <Banner tone="info">
              <strong>Session detail is kept for 60 days; the daily totals stay for good.</strong>{" "}
              This database is shared with your popup and bundle apps, so storing every pageview
              forever is not free — one row per session, rolled up nightly, keeps the history
              without the weight.
              {data.detailTot && " Detail currently goes back to " + data.detailTot + "."}
            </Banner>
          </>
        )}
      </div>
    </main>
  );
}
