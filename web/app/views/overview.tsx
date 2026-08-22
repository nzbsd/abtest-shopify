import { Link } from "@remix-run/react";
import { PageHead } from "~/components/shell";
import {
  Badge, Banner, Card, CardHead, Delta, IconCoins, IconFlask, IconUsers, Kpi, Leeg, Track,
} from "~/components/ui";
import {
  geld, heel, looptDagen, ondertekend, procent, telOp, type StatRij,
} from "~/lib/analytics";
import { toetsOmzetPerBezoeker } from "~/lib/stats";
import type { PriceTest } from "~/lib/priceTest.server";

/**
 * Startscherm: alles wat loopt in één blik.
 *
 * Bewust geen enkel getal zonder context. Een test die drie dagen draait met
 * veertig bezoekers hoort er niet hetzelfde uit te zien als een test die
 * klaar is om op te besluiten, ook al is de lift toevallig gelijk.
 */
export function OverviewView({
  tests, stats, basis,
}: {
  tests: PriceTest[];
  stats: StatRij[];
  basis: string;
}) {
  const lopend = tests.filter((t) => t.status === "running");
  const rest = tests.filter((t) => t.status !== "running");

  const alleBezoekers = stats.reduce((a, r) => a + (Number(r.visitors) || 0), 0);
  const alleOrders = stats.reduce((a, r) => a + (Number(r.orders) || 0), 0);
  const alleOmzet = stats.reduce((a, r) => a + (Number(r.revenue_cents) || 0), 0);

  return (
    <main className="page">
      <PageHead
        titel="Overzicht"
        sub="Welke prijstests draaien er, en hoe staan ze ervoor."
        actie={<Link className="btn btn--iris" to={basis + "/tests"}>Nieuwe test</Link>}
      />

      <div className="stack">
        <div className="grid grid--4">
          <Kpi icon={<IconFlask />} tone="control" label="Lopende tests"
               value={heel(lopend.length)}
               note={tests.length ? heel(tests.length) + " in totaal" : "nog geen aangemaakt"} />
          <Kpi icon={<IconUsers />} tone="neutral" label="Bezoekers gemeten"
               value={heel(alleBezoekers)} note="over alle tests" />
          <Kpi icon={<IconCoins />} tone="neutral" label="Orders"
               value={heel(alleOrders)} note="toegewezen aan een groep" />
          <Kpi icon={<IconCoins />} tone="test" label="Omzet"
               value={geld(alleOmzet / 100)} note="binnen de tests" />
        </div>

        {!tests.length && (
          <Card>
            <Leeg>
              <div style={{ maxWidth: 380 }}>
                <strong style={{ display: "block", marginBottom: 8, color: "var(--ink)" }}>
                  Nog geen tests
                </strong>
                Maak eerst in Shopify een duplicaat van het product met de prijs die je wilt
                testen, en koppel er je bundel, selling plan en reviews aan. Daarna maak je hier
                de test aan.
                <div style={{ marginTop: 16 }}>
                  <Link className="btn btn--iris" to={basis + "/tests"}>Naar Tests</Link>
                </div>
              </div>
            </Leeg>
          </Card>
        )}

        {lopend.map((t) => {
          const eigen = stats.filter((r) => r.test_id === t.id);
          const c = telOp(eigen, "control");
          const te = telOp(eigen, "test");
          const toets = toetsOmzetPerBezoeker(c, te);
          const dagen = looptDagen(t.started_at);
          const kleinste = Math.min(c.visitors, te.visitors);
          const voortgang = Math.min(kleinste / 300, 1);

          return (
            <Card key={t.id}>
              <CardHead
                title={t.control_title || t.control_product_id}
                sub={
                  (dagen !== null ? "loopt " + dagen + " dag" + (dagen === 1 ? "" : "en") : "gestart") +
                  " · " + t.split_pct + "% in de testgroep · duplicaat " + t.test_product_handle
                }
                action={
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <Badge status={t.status} />
                    <Link className="btn btn--sm" to={basis + "/analytics"}>Details</Link>
                  </div>
                }
              />
              <div className="card__body">
                <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "baseline", marginBottom: 16 }}>
                  <div>
                    <p className="small muted">Omzet per bezoeker</p>
                    <p className="num" style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-.03em", marginTop: 2 }}>
                      {ondertekend(toets.lift)}
                    </p>
                  </div>
                  <div>
                    <p className="small muted">Controle</p>
                    <p className="num" style={{ fontSize: 17, fontWeight: 600, marginTop: 4 }}>
                      {geld(c.rpv)} <span className="muted small">· {procent(c.cr)} conversie</span>
                    </p>
                  </div>
                  <div>
                    <p className="small muted">Test</p>
                    <p className="num" style={{ fontSize: 17, fontWeight: 600, marginTop: 4 }}>
                      {geld(te.rpv)} <span className="muted small">· {procent(te.cr)} conversie</span>
                    </p>
                  </div>
                  <div style={{ marginLeft: "auto" }}>
                    <Delta waarde={toets.lift} />
                  </div>
                </div>

                <Track value={voortgang} color={toets.significant ? "var(--up)" : "var(--iris-lit)"} />
                <p className="small muted" style={{ marginTop: 8 }}>
                  {toets.significant
                    ? "Het verschil is aantoonbaar. Je kunt hierop besluiten."
                    : kleinste < 300
                      ? heel(kleinste) + " van de ~300 bezoekers per groep waarop een verschil zichtbaar wordt."
                      : "Genoeg bezoekers, maar het verschil is nog niet aantoonbaar. Laat doorlopen of accepteer dat het effect klein is."}
                </p>
              </div>
            </Card>
          );
        })}

        {rest.length > 0 && (
          <Card>
            <CardHead title="Niet actief" sub="Concepten en gestopte tests." />
            <div className="card__body card__body--flush">
              {rest.map((t) => {
                const eigen = stats.filter((r) => r.test_id === t.id);
                const toets = toetsOmzetPerBezoeker(telOp(eigen, "control"), telOp(eigen, "test"));
                return (
                  <div className="test-row" key={t.id}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <strong>{t.control_title || t.control_product_id}</strong>
                        <Badge status={t.status} />
                      </div>
                      <div className="pair">
                        duplicaat <code>{t.test_product_handle}</code> ·{" "}
                        {(t.variant_map || []).length} variant(en) gekoppeld
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      {t.status === "stopped" && <Delta waarde={toets.lift} />}
                      <Link className="btn btn--sm" to={basis + "/tests"}>Beheren</Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        <Banner tone="info">
          <strong>Onthoud bij het lezen:</strong> omzet per bezoeker is de uitslag, conversie is
          context. Een hogere prijs verlaagt de conversie bijna altijd — de vraag is of de hogere
          marge dat goedmaakt.
        </Banner>
      </div>
    </main>
  );
}
