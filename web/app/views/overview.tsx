import { Link } from "@remix-run/react";
import { PageHead } from "~/components/shell";
import {
  Badge, Banner, Card, CardHead, Delta, IconCoins, IconFlask, IconUsers, Kpi, Leeg, Track,
} from "~/components/ui";
import {
  combineer, geld, heel, looptDagen, ondertekend, procent, telOp, type StatRij,
} from "~/lib/analytics";
import type { OrderCijfers, OrderResultaat } from "~/lib/orders.server";
import { toetsOmzetPerBezoeker } from "~/lib/stats";
import { gezondheid } from "~/lib/health";
import type { PriceTest } from "~/lib/priceTest.server";
import { typeInfo } from "~/lib/testTypes";
import { benodigd, metricInfo, noemer, noemerNaam } from "~/lib/metrics";

/**
 * Wat er in deze test verschilt, in één regel.
 *
 * Stond hier eerst hard als "duplicate <handle>", wat op een thema- of
 * url-test een lege of misleidende regel opleverde.
 */
function watVarieert(t: PriceTest): string {
  switch (t.test_type) {
    case "template": return "template ?view=" + (t.template_suffix ?? "?");
    case "url":      return (t.control_url ?? "?") + " → " + (t.test_url ?? "?");
    case "theme":    return "theme " + (t.test_theme_name ?? "variant") + ", every page";
    default:         return "duplicate " + (t.test_product_handle ?? "?");
  }
}

/**
 * Startscherm: alles wat loopt in één blik.
 *
 * Bewust geen enkel getal zonder context. Een test die drie dagen draait met
 * veertig bezoekers hoort er niet hetzelfde uit te zien als een test die
 * klaar is om op te besluiten, ook al is de lift toevallig gelijk.
 */
const GEEN: OrderCijfers = {
  orders: 0, units: 0, revenueCents: 0, revenueSqCents: 0, subOrders: 0, subRevenueCents: 0,
};

export function OverviewView({
  tests, stats, basis, orders = {},
}: {
  tests: PriceTest[];
  stats: StatRij[];
  basis: string;
  /** Per test-id de ordercijfers zoals ze bij Shopify staan. */
  orders?: Record<number, OrderResultaat>;
}) {
  const lopend = tests.filter((t) => t.status === "running");
  const rest = tests.filter((t) => t.status !== "running");

  const alleBezoekers = stats.reduce((a, r) => a + (Number(r.visitors) || 0), 0);
  const alleCijfers = Object.values(orders);
  const alleOrders = alleCijfers.reduce((a, o) => a + o.control.orders + o.test.orders, 0);
  const alleOmzet = alleCijfers.reduce((a, o) => a + o.control.revenueCents + o.test.revenueCents, 0);

  return (
    <main className="page">
      <PageHead
        titel="Overview"
        sub="What is running, how far along it is, and whether anything needs your attention."
        actie={<Link className="btn btn--iris" to={basis + "/tests"}>New test</Link>}
      />

      <div className="stack">
        <div className="grid grid--4">
          <Kpi icon={<IconFlask />} tone="control" label="Running tests"
               value={heel(lopend.length)}
               note={tests.length ? heel(tests.length) + " in total" : "none created yet"} />
          <Kpi icon={<IconUsers />} tone="neutral" label="Visitors measured"
               value={heel(alleBezoekers)} note="people who saw a tested page" />
          <Kpi icon={<IconCoins />} tone="neutral" label="Orders"
               value={heel(alleOrders)} note="placed after seeing one" />
          <Kpi icon={<IconCoins />} tone="test" label="Revenue"
               value={geld(alleOmzet / 100)} note="within the tests" />
        </div>

        {!tests.length && (
          <Card>
            <Leeg>
              <div style={{ maxWidth: 380 }}>
                <strong style={{ display: "block", marginBottom: 8, color: "var(--ink)" }}>
                  No tests yet
                </strong>
                A test compares two versions of something and splits your traffic between them —
                a price, a product page, a landing page, or a whole theme. The wizard walks you
                through it and tells you what to prepare in Shopify first.
                <div style={{ marginTop: 16 }}>
                  <Link className="btn btn--iris" to={basis + "/tests"}>Go to Tests</Link>
                </div>
              </div>
            </Leeg>
          </Card>
        )}

        {lopend.map((t) => {
          const eigen = stats.filter((r) => r.test_id === t.id);
          const o = orders[t.id];
          const c = combineer(telOp(eigen, "control"), o?.control ?? GEEN);
          const te = combineer(telOp(eigen, "test"), o?.test ?? GEEN);
          /**
           * De metriek waarop DEZE test besloten wordt, niet omzet per bezoeker
           * voor alles.
           *
           * Dit stond hardgecodeerd, waardoor het overzicht iets anders zei dan
           * het uitslagscherm over dezelfde test. Twee schermen die hetzelfde
           * getal anders noemen is erger dan één scherm dat het niet noemt.
           */
          const doel = metricInfo(t.primary_metric);
          const betrouwbaar = t.confidence_pct ?? 95;
          const cIn = { visitors: c.visitors, atc: c.atc, orders: c.orders,
                        revenueCents: c.revenueCents, revenueSqCents: c.revenueSqCents,
                        subOrders: (o?.control ?? GEEN).subOrders };
          const tIn = { visitors: te.visitors, atc: te.atc, orders: te.orders,
                        revenueCents: te.revenueCents, revenueSqCents: te.revenueSqCents,
                        subOrders: (o?.test ?? GEEN).subOrders };
          const toets = doel.toets(cIn, tIn, betrouwbaar);

          const dagen = looptDagen(t.started_at);
          const gezond = gezondheid(t, stats);

          // Voortgang tegen het doel dat bij de test hoort, niet tegen een
          // vast getal van 300 dat voor geen enkele test klopt.
          const doelAantal = benodigd(doel.key, cIn, t.mde_pct ?? 10, betrouwbaar);
          const behaald = Math.min(noemer(doel.key, cIn), noemer(doel.key, tIn));
          const kleinste = Math.min(c.visitors, te.visitors);
          const voortgang = doelAantal ? Math.min(behaald / doelAantal, 1) : 0;

          return (
            <Card key={t.id}>
              <CardHead
                title={t.naam || t.control_title || t.test_theme_name || typeInfo(t.test_type).naam}
                sub={
                  (dagen !== null ? "running for " + dagen + " day" + (dagen === 1 ? "" : "s") : "started") +
                  " · " + t.split_pct + "% in the test group · " + watVarieert(t)
                }
                action={
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <Badge status={t.status} />
                    <Link className="btn btn--sm" to={basis + "/analytics?test=" + t.id}>Details</Link>
                  </div>
                }
              />
              <div className="card__body">
                {gezond.status !== "ok" && (
                  <div style={{ marginBottom: 16 }}>
                    <Banner tone={gezond.status === "wachten" ? "info" : "error"}>
                      <strong>
                        {gezond.status === "wachten" ? "Waiting for the first visitors." :
                         gezond.status === "stil" ? "Running, but nothing is being measured." :
                         "Measurement has gone quiet."}
                      </strong>{" "}
                      {gezond.uitleg}
                    </Banner>
                  </div>
                )}
                <div className="rij rij--ruim" style={{ marginBottom: 16 }}>
                  <div>
                    <span className="cijferlabel">{doel.naam}</span>
                    <p className="cijfer cijfer--mid">
                      {ondertekend(toets.lift)}
                    </p>
                  </div>
                  <div>
                    <span className="cijferlabel">Control</span>
                    <p className="cijfer cijfer--sm">
                      {doel.vorm === "geld" ? geld(doel.waarde(cIn)) : procent(doel.waarde(cIn))}
                    </p>
                  </div>
                  <div>
                    <span className="cijferlabel">Test</span>
                    <p className="cijfer cijfer--sm">
                      {doel.vorm === "geld" ? geld(doel.waarde(tIn)) : procent(doel.waarde(tIn))}
                    </p>
                  </div>
                  <div className="rij--eind">
                    <Delta waarde={toets.lift} />
                  </div>
                </div>

                <Track value={voortgang} color={toets.significant ? "var(--up)" : "var(--iris-lit)"} />
                <p className="small muted" style={{ marginTop: 8 }}>
                  {!doelAantal
                    ? heel(kleinste) + " visitors per group so far. The target fills in once there is " +
                      "enough data to size it."
                    : voortgang >= 1 && toets.significant
                      ? "At full size and statistically solid. You can decide on this."
                      : voortgang >= 1
                        ? "At full size, but the difference is not solid. That is an answer too: any " +
                          "effect is smaller than the " + (t.mde_pct ?? 10) + "% you set out to find."
                        : heel(behaald) + " of " + heel(doelAantal) + " " + noemerNaam(doel.key) +
                          " per group" +
                          (toets.significant
                            ? " — significant already, but early significance often disappears. Let it finish."
                            : ".")}
                </p>
              </div>
            </Card>
          );
        })}

        {rest.length > 0 && (
          <Card>
            <CardHead title="Not running" sub="Drafts you have not started, and tests you have stopped." />
            <div className="card__body card__body--flush">
              {rest.map((t) => {
                const eigen = stats.filter((r) => r.test_id === t.id);
                const o = orders[t.id];
                const toets = toetsOmzetPerBezoeker(
                  combineer(telOp(eigen, "control"), o?.control ?? GEEN),
                  combineer(telOp(eigen, "test"), o?.test ?? GEEN),
                );
                return (
                  <div className="test-row" key={t.id}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                        <strong>{t.control_title || t.control_product_id}</strong>
                        <Badge status={t.status} />
                      </div>
                      <div className="pair">
                        duplicate <code>{t.test_product_handle}</code> ·{" "}
                        {(t.variant_map || []).length} variant(s) matched
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      {t.status === "stopped" && <Delta waarde={toets.lift} />}
                      <Link className="btn btn--sm" to={basis + "/tests"}>Manage</Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        <Banner tone="info">
          <strong>When reading these:</strong> revenue per visitor is the verdict, conversion is
          context. A higher price nearly always lowers conversion — the question is whether the
          higher margin makes up for it.
        </Banner>
      </div>
    </main>
  );
}
