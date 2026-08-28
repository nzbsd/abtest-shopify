import { useState } from "react";
import { useSearchParams } from "@remix-run/react";
import { PageHead } from "~/components/shell";
import { Lijn, Matrix, Sparkline, Trechter } from "~/components/charts";
import {
  Aandeel, Badge, Banner, Card, CardHead, Delta, IconCart, IconCheck, IconCoins,
  Kpi, Leeg, Legend, Segmented, Tabs, Track, Verdeling, Vergelijk,
} from "~/components/ui";
import {
  bedragVerschil, beperkTotDagen, combineer, dagReeks, geld, heel, korteDatum, looptDagen, ondertekend, procent,
  telOp, type DagRij, type DekkingRij, type DeviceRij, type StatRij,
} from "~/lib/analytics";
import type { OrderCijfers, OrderResultaat } from "~/lib/orders.server";
import {
  benodigdeBezoekers, benodigdVoorVerhouding, pTekst, toetsAandeel, toetsConversie,
  toetsOmzetPerBezoeker, toetsVerdeling, uitslagTekst,
} from "~/lib/stats";
import { benodigd, metricInfo, noemer, noemerNaam } from "~/lib/metrics";
import {
  DIMENSIES, LEEG, bouwSegmenten, dimensieKan, telSamen, waaromNiet, type SegmentDimensie,
} from "~/lib/segments";
import type { PriceTest } from "~/lib/priceTest.server";
import { ForecastView } from "./forecast";

type Metric = "rpv" | "cr" | "orders" | "visitors";
type Range = "7" | "14" | "30" | "0";

const GEEN: OrderCijfers = {
  orders: 0, units: 0, revenueCents: 0, revenueSqCents: 0, subOrders: 0, subRevenueCents: 0,
};

/**
 * De testgroep tegenover de controlegroep, als percentage.
 *
 * Een streepje als de controlegroep nul is: dan is er geen noemer en zegt een
 * percentage niets.
 *
 * Het bezoekersverschil krijgt bewust "geen" mee, dus grijs in plaats van
 * groen of rood. Meer bezoekers aan één kant is geen uitslag maar gewoon hoe
 * de 50/50-verdeling toevallig uitviel; het kleuren zou suggereren dat de test
 * daar iets wint of verliest.
 */
function Verschil(controle: number, test: number, goedAls: "up" | "geen" = "up") {
  if (!controle) return <span className="muted">—</span>;
  return <Delta waarde={((test - controle) / controle) * 100} goedAls={goedAls} />;
}

export function AnalyticsView({
  tests, stats, daily, devices = [], dekking = [], orders = {},
}: {
  tests: PriceTest[];
  stats: StatRij[];
  daily: DagRij[];
  /** Bezoekers en orders per device, uit onze eigen meting. */
  devices?: DeviceRij[];
  /** Hoeveel bezoekers buiten de device-uitsplitsing vallen. */
  dekking?: DekkingRij[];
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
  const [dim, setDim] = useState<SegmentDimensie>("device");
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

  const betrouwbaarheid = test.confidence_pct ?? 95;
  const revenueTest = toetsOmzetPerBezoeker(c, t, betrouwbaarheid);
  const convTest = toetsConversie(c, t, betrouwbaarheid);
  const enough = c.visitors >= 300 && t.visitors >= 300;

  /**
   * De uitslag zoals de test is opgezet: de vooraf gekozen metriek, met de
   * vooraf gekozen betrouwbaarheid. Alles daaronder blijft zichtbaar, maar
   * uitdrukkelijk als context en niet als beslisgrond - anders kies je alsnog
   * achteraf de metriek die het beste uitkomt.
   */
  const doel = metricInfo(test.primary_metric);
  const invoer = (g: typeof c, o: OrderCijfers) => ({
    visitors: g.visitors, atc: g.atc, orders: g.orders,
    revenueCents: g.revenueCents, revenueSqCents: g.revenueSqCents,
    subOrders: o.subOrders,
  });
  const cIn = invoer(c, oc);
  const tIn = invoer(t, ot);
  const doelToets = doel.toets(cIn, tIn, betrouwbaarheid);

  /**
   * Guardrails: niet "wint het", maar "verliest het niet".
   *
   * Een guardrail slaat alleen alarm als hij significant de verkeerde kant op
   * gaat. Hem ook laten juichen bij winst zou hem een tweede hoofdmetriek
   * maken, en dan ben je alsnog vijf getallen aan het afzoeken naar het beste.
   */
  const guardrails = (test.guardrails ?? []).map((k) => {
    const m = metricInfo(k);
    const toets = m.toets(cIn, tIn, betrouwbaarheid);
    const geschonden = toets.bruikbaar && toets.significant && toets.lift < 0;

    /**
     * Groen betekent hier alleen "meetbaar beter", niet "nog niet bewezen
     * slechter".
     *
     * Dat verschil deed er meteen toe: op de eerste testdata stond het
     * abonnementsaandeel 40% lager zonder significant te zijn, en een groene
     * stip naast -40,5% leest als "prima" terwijl het precies het signaal is
     * waar een guardrail voor bedoeld is. Nog niet hard genoeg om alarm te
     * slaan, veel te hard om groen te noemen.
     */
    const staat: "goed" | "slecht" | "let-op" | "leeg" =
      !toets.bruikbaar ? "leeg"
      : geschonden ? "slecht"
      : toets.significant && toets.lift > 0 ? "goed"
      : toets.lift < -5 ? "let-op"
      : "leeg";

    return { m, toets, geschonden, staat };
  });

  // Klopt de verdeling? Staat los van de uitslag omdat het iets anders zegt:
  // niet "welke wint" maar "is deze vergelijking überhaupt eerlijk".
  const srm = toetsVerdeling(c.visitors, t.visitors, test.split_pct);

  /**
   * De segmenten, in dezelfde metriek als de uitslag.
   *
   * Drie dimensies uit drie bronnen, en die bronnen verschillen wezenlijk:
   * device en markt komen uit onze eigen meting op de storefront (dus met
   * bezoekers), valuta komt uit de orders bij Shopify (dus zonder). Vandaar
   * dat de bezoekersvelden bij valuta leeg blijven in plaats van geraden -
   * een verzonnen noemer geeft een conversie die nergens op slaat.
   */
  const segmentBron = (() => {
    const uit: Record<string, { control: typeof LEEG; test: typeof LEEG }> = {};
    const zet = (naam: string, cohort: string, waarden: Partial<typeof LEEG>) => {
      if (!naam) return;
      uit[naam] ||= { control: { ...LEEG }, test: { ...LEEG } };
      const kant = cohort === "test" ? "test" : "control";
      uit[naam][kant] = telSamen(uit[naam][kant], { ...LEEG, ...waarden });
    };

    if (dim === "device") {
      for (const r of devices.filter((d) => d.test_id === test.id)) {
        zet(r.device, r.cohort, {
          visitors: Number(r.visitors) || 0,
          atc: Number(r.add_to_carts) || 0,
          orders: Number(r.orders) || 0,
          revenueCents: Number(r.revenue_cents) || 0,
          revenueSqCents: Number(r.revenue_sq_cents) || 0,
        });
      }
    } else if (dim === "market") {
      for (const r of ownStats) {
        zet(r.market || "—", r.cohort, {
          visitors: Number(r.visitors) || 0,
          atc: Number(r.add_to_carts) || 0,
          orders: Number(r.orders) || 0,
          revenueCents: Number(r.revenue_cents) || 0,
          revenueSqCents: Number(r.revenue_sq_cents) || 0,
        });
      }
    } else {
      for (const [valuta, paar] of Object.entries(ord?.perValuta ?? {})) {
        for (const kant of ["control", "test"] as const) {
          const g = paar[kant];
          zet(valuta, kant, {
            orders: g.orders,
            revenueCents: g.revenueCents,
            revenueSqCents: g.revenueSqCents,
            subOrders: g.subOrders,
          });
        }
      }
    }
    return uit;
  })();

  const segmenten = bouwSegmenten(segmentBron, doel.key, betrouwbaarheid, doelToets.lift);

  /**
   * Hoeveel verkeer buiten de device-uitsplitsing valt.
   *
   * Device wordt pas sinds kort gemeten, en de eerste versie mat het verkeerd.
   * Zonder dit getal lijkt de tabel het hele verkeer te beschrijven terwijl hij
   * er een fractie van beslaat - en een uitsplitsing waarvan je niet weet hoe
   * compleet hij is, is erger dan geen uitsplitsing.
   */
  const dek = dekking.find((d) => d.test_id === test.id);
  const buitenBeeld = Number(dek?.zonder_device ?? 0);
  const inBeeld = Number(dek?.met_device ?? 0);

  /**
   * Het doelaantal, uit de opzet en niet uit wat er toevallig gemeten is.
   *
   * Dit stond eerder op de waargenomen lift, en dat is precies verkeerd om:
   * dan verschuift het doel elke dag mee met de ruis, en "we zijn er bijna"
   * betekent niets. Nu is het de lift die je vooraf de moeite waard vond.
   */
  const mde = test.mde_pct ?? 10;
  const target = benodigd(doel.key, cIn, mde, betrouwbaarheid);
  const behaald = Math.min(noemer(doel.key, cIn), noemer(doel.key, tIn));
  const progress = target ? behaald / target : 0;
  const smallest = Math.min(c.visitors, t.visitors);

  const days = looptDagen(test.started_at);
  /* Days come from two places: visitors from our own events, orders and money
     from Shopify. Merged here so one chart can switch between them. */
  /* Als functie in plaats van als eenmalige berekening, zodat een kaart een
     andere maat kan opvragen dan de grafiek eronder toont. De sparklines op de
     omzetkaarten willen altijd omzet per bezoeker, ongeacht welk tabblad van de
     grafiek openstaat. */
  const maakPunten = (m: Metric) => {
    const geldMaat = m === "rpv" || m === "orders" || m === "cr";
    const bezoekersReeks = dagReeks(ownDaily, geldMaat ? "visitors" : m);
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
        if (m === "orders") return g.orders;
        const v = co === "control" ? bez?.control ?? 0 : bez?.test ?? 0;
        if (m === "cr") return v ? (g.orders / v) * 100 : 0;
        return v ? g.revenueCents / 100 / v : 0;
      };
      return { dag, control: waarde("control"), test: waarde("test") };
    });
  };

  const points = maakPunten(metric);
  const rpvPunten = maakPunten("rpv");

  /**
   * Wat er onderaan een omzetkaart komt te staan.
   *
   * Een sparkline heeft vier punten nodig - met twee is het per definitie een
   * rechte lijn van hoek tot hoek. Maar dat betekende dat die kaarten de
   * eerste dagen van elke test leeg bleven: een icoon en een getal, meer niet.
   * En juist die eerste dagen kijk je er het vaakst naar.
   *
   * Een stippenmatrix heeft dat probleem niet. Twee kolommen stippen is een
   * eerlijke weergave van twee dagen, en hij groeit mee. Dus: matrix zolang
   * de reeks kort is, sparkline zodra er genoeg punten zijn om een vorm te
   * hebben.
   */
  const omzetBeeld = (kant: "control" | "test") => {
    const reeks = rpvPunten.map((p) => p[kant]);
    if (reeks.length >= 4) return null;
    if (reeks.length < 1) return null;
    return (
      <div className="kpi__matrix">
        <Matrix
          waarden={reeks}
          kleur={"var(--" + kant + ")"}
          label={"Revenue per visitor for " + kant + " over the last " + reeks.length + " days"}
        />
        <span className="piek">{reeks.length} day{reeks.length === 1 ? "" : "s"}</span>
      </div>
    );
  };

  const format: Record<Metric, (v: number) => string> = {
    rpv: geld,
    cr: (v) => procent(v, 1),
    orders: heel,
    visitors: heel,
  };

  const subToets = toetsAandeel(oc.subOrders, oc.orders, ot.subOrders, ot.orders, betrouwbaarheid);
  const subAandeel = (o: OrderCijfers) => (o.orders ? (o.subOrders / o.orders) * 100 : 0);
  const subOmzetAandeel = (o: OrderCijfers) =>
    o.revenueCents ? (o.subRevenueCents / o.revenueCents) * 100 : 0;

  const variantNamen = Object.keys(ord?.perVariant ?? {}).sort();
  const heeftOrders = oc.orders + ot.orders > 0;

  return (
    <main className="page">
      <PageHead
        titel="Analytics"
        sub={(test.control_title || test.control_product_id) +
          (days !== null ? " · running for " + days + " days" : "")}
        actie={
          /* De periodekiezer hoort hier en niet in de grafiekkaart.
             Hij filtert ownDaily, en dus alles op deze pagina - de trend, de
             sparklines, de dagreeksen. Hem in de kop van één kaart zetten
             suggereert dat hij alleen die kaart aangaat, en dat is precies
             het soort misverstand waardoor mensen conclusies trekken uit een
             venster dat ze niet doorhebben. */
          <div className="paginabalk">
            <Badge status={test.status} />
            {tests.length > 1 && (
              <select value={String(test.id)} onChange={(e) => setTestId(Number(e.target.value))}
                      style={{ width: "auto", minWidth: 220 }}>
                {tests.map((x) => (
                  <option key={x.id} value={x.id}>{x.control_title || x.control_product_id}</option>
                ))}
              </select>
            )}
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

      <div style={{ marginBottom: 20 }}>
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
        {/* ── de verdeling: eerst kijken of de vergelijking eerlijk is ──── */}
        {srm.scheef && (
          <Banner tone="error">
            <strong>The split is off, so these results cannot be trusted.</strong> You set{" "}
            {test.split_pct}% test, but {heel(srm.werkelijkTest)} of {heel(srm.totaal)} visitors
            landed there — {((srm.werkelijkTest / srm.totaal) * 100).toFixed(1)}% instead of{" "}
            {test.split_pct}%. At this many visitors that is not chance ({pTekst(srm.p)}). Something
            is dropping visitors on one side: a redirect failing, a cache serving one version, or
            events not arriving. Fix that before reading anything below.
          </Banner>
        )}

        {guardrails.some((g) => g.geschonden) && (
          <Banner tone="error">
            <strong>A guardrail is being hit.</strong>{" "}
            {guardrails.filter((g) => g.geschonden)
              .map((g) => g.m.naam.toLowerCase() + " is " + ondertekend(g.toets.lift))
              .join(", ")}
            . You said this must not get worse, and it measurably has — even if{" "}
            {doel.naam.toLowerCase()} is up.
          </Banner>
        )}

        {/* ── the verdict ──────────────────────────────────────────────── */}
        {/* De uitslag als eigen tegel, niet als streep binnen een kaart.
            Dat was de fout in de vorige poging: een verloop tussen een
            kaartkop en een banner leest als een renderfout. Een tegel met
            eigen hoeken die naast andere kaarten staat, leest als ontwerp. */}
        <article className="uitslag">
          <p className="uitslag__pil">{doel.naam}</p>
          <p className="uitslag__cijfer num">{ondertekend(doelToets.lift)}</p>
          <p className="uitslag__van num">
            {doel.vorm === "geld"
              ? geld(doel.waarde(cIn)) + " → " + geld(doel.waarde(tIn))
              : doel.waarde(cIn).toFixed(2) + "% → " + doel.waarde(tIn).toFixed(2) + "%"}
          </p>
          {doelToets.bruikbaar && (
            <p className="uitslag__staat num">
              {doelToets.significant ? "statistically solid" : "not solid yet"} · {pTekst(doelToets.p)}
              {doelToets.significant &&
                " · real difference between " + ondertekend(doelToets.onder) + " and " + ondertekend(doelToets.boven)}
            </p>
          )}
        </article>

        <Card>
          <CardHead
            title={doel.naam}
            sub={"Chosen up front as what decides this test · " + doel.toetsnaam +
                 " at " + betrouwbaarheid + "% confidence"}
          />
          <div className="card__body">

            <Banner tone={
              srm.scheef ? "error"
              : !enough || !doelToets.significant ? "warn"
              : progress < 1 ? "warn"
              : doelToets.lift >= 0 ? "ok" : "error"
            }>
              {srm.scheef
                ? "The split is off — read the warning above before drawing any conclusion from this number."
                : doelToets.significant && progress < 1 && target > 0
                  ? "This looks significant, but the test has not reached its planned size yet (" +
                    Math.round(progress * 100) + "%). Early significance disappears more often than " +
                    "it holds. Checking every day and stopping at the first green multiplies the " +
                    "false-alarm rate: at " + betrouwbaarheid + "% confidence one look risks " +
                    (100 - betrouwbaarheid) + "%, but ten looks over a two-week test come out " +
                    "around " +
                    /* 1 - (1 - alfa)^k, met k = 10 kijkmomenten. Een ruwe
                       bovengrens omdat opeenvolgende kijkmomenten samenhangen,
                       maar de orde van grootte klopt en dat is het punt. */
                    Math.round((1 - Math.pow(betrouwbaarheid / 100, 10)) * 100) + "%. Let it finish."
                  : uitslagTekst(doelToets, enough)}
            </Banner>

            {guardrails.length > 0 && (
              <div className="guardrails">
                {guardrails.map((g) => (
                  <div key={g.m.key} className="guardrail">
                    <span className={"guardrail__stip guardrail__stip--" + g.staat} />
                    <span className="guardrail__naam">{g.m.naam}</span>
                    <span className="guardrail__waarde num">
                      {g.toets.bruikbaar ? ondertekend(g.toets.lift) : "—"}
                    </span>
                    <span className="small muted">
                      {g.staat === "leeg" && !g.toets.bruikbaar ? "not enough data"
                        : g.staat === "slecht" ? "measurably worse"
                        : g.staat === "goed" ? "measurably better"
                        : g.staat === "let-op" ? "down, but not solid enough to call"
                        : "no measurable change"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {target > 0 && progress < 1 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span className="small muted">Towards the size you planned for: a {mde}% change</span>
                  <span className="small num muted">
                    {heel(behaald)} of {heel(target)} {noemerNaam(doel.key)} per group
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

        {/* ── de grafiek naast de cijfers die hij verklaart ─────────────
            Waarom deze twee bij elkaar en niet in aparte rijen: de trend en de
            omzet per bezoeker zijn hetzelfde verhaal op twee tijdschalen. Ze
            stonden gescheiden door twee andere kaarten, waardoor je moest
            scrollen om te zien of het cijfer erboven een piek of een plateau
            was.

            De twee kengetallen blijven boven elkaar in dezelfde kolom. Dat is
            geen gebrek aan ruimte maar een keuze: control recht boven test
            vergelijkt makkelijker dan naast elkaar, want je oog hoeft maar één
            kant op. Ongelijke breedtes geven aan een paar zou bovendien
            suggereren dat de ene arm belangrijker is, en dat is precies wat een
            A/B-test niet moet zeggen. */}
        <div className="bento">
          <Card className="bento__hoofd">
            <CardHead
              title="Daily trend"
              action={
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
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
                </div>
              }
            />
            <div className="card__body">
              <div style={{ marginBottom: 16 }}><Legend /></div>
              <Lijn punten={points} formatteer={format[metric]} />
            </div>
          </Card>

          <div className="bento__zij">
            <Kpi
              icon={<IconCoins />} tone="control" label="Revenue / visitor — control"
              value={geld(c.rpv)}
              note={heel(c.visitors) + " visitors · " + heel(c.orders) + " orders"}
              voet={omzetBeeld("control")}
              spark={
                <Sparkline
                  punten={rpvPunten.map((p) => p.control)}
                  kleur="var(--control)"
                  label={"Revenue per visitor for control over the last " + rpvPunten.length + " days"}
                />
              }
            />
            <Kpi
              icon={<IconCoins />} tone="test" label="Revenue / visitor — test"
              value={geld(t.rpv)}
              note={heel(t.visitors) + " visitors · " + heel(t.orders) + " orders"}
              delta={<Delta waarde={revenueTest.lift} />}
              voet={omzetBeeld("test")}
              spark={
                <Sparkline
                  punten={rpvPunten.map((p) => p.test)}
                  kleur="var(--test)"
                  label={"Revenue per visitor for test over the last " + rpvPunten.length + " days"}
                />
              }
            />
          </div>
        </div>

        <div className="grid grid--2">
          <Vergelijk
            label="Conversion"
            control={procent(c.cr)}
            test={procent(t.cr)}
            delta={convTest.lift}
            goedAls="geen"
            ruw={{ control: c.cr, test: t.cr }}
            noot={convTest.bruikbaar
              ? pTekst(convTest.p) + " · a higher price nearly always lowers this; the question is whether revenue follows"
              : "Too few orders to compare yet."}
          />
          <Vergelijk
            label="Average order value"
            control={geld(c.aov)}
            test={geld(t.aov)}
            delta={c.aov ? ((t.aov - c.aov) / c.aov) * 100 : 0}
            ruw={{ control: c.aov, test: t.aov }}
            noot={
              (c.aov ? bedragVerschil(t.aov - c.aov) + " per order · " : "") +
              heel(c.orders) + " versus " + heel(t.orders) + " orders"
            }
          />
        </div>

        {/* De trechter hoort ook hier, en niet alleen op het orderblad.
            Conversie en orderwaarde hierboven zeggen wát er anders is; deze
            zegt wáár het gebeurt - bij het zien van de pagina, bij het in de
            cart leggen, of bij het afrekenen. Dat is precies de vervolgvraag
            die je stelt zodra je de uitslag hebt gelezen, en daarvoor een
            tabblad verder moeten is een omweg.

            Wijs een stap aan en de andere treden terug; dan lees je hem als
            een verhaal in plaats van als een tabel. */}
        <Card>
          <CardHead
            title="Where the difference happens"
            sub="Visitors who saw the page, then added to cart, then bought. Hover a step to isolate it; on the right the share that made it from the step above, control / test."
          />
          <div className="card__body">
            <div style={{ marginBottom: 16 }}><Legend /></div>
            <Trechter
              stappen={[
                { label: "Visitors", control: c.visitors, test: t.visitors },
                ...(c.atc + t.atc > 0
                  ? [{ label: "Added to cart", control: c.atc, test: t.atc }]
                  : []),
                { label: "Orders", control: c.orders, test: t.orders },
              ]}
            />
          </div>
        </Card>

        </>)}

        {tab === "orders" && (<>
        <div className="grid grid--2">
          {/* ── funnel ─────────────────────────────────────────────────── */}
          <Card>
            <CardHead title="Where people drop off"
                       sub="Visitors who saw the page, then added to cart, then bought. On the right the share that made it from the step above: control / test." />
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
                <p className="small muted" style={{ marginTop: 16 }}>
                  No add-to-cart measured yet. The snippet watches for the request itself — through
                  fetch as well as XMLHttpRequest — so a theme that adds to the cart with
                  JavaScript is covered. If this stays empty while orders come in, the theme is
                  probably still running an older version of the snippet. Visitors and orders are
                  unaffected either way.
                </p>
              )}
            </div>
          </Card>

          {/* ── per group ──────────────────────────────────────────────── */}
          <Card>
            <CardHead title="Per group"
                       sub="Visitors and cart adds come from our own measurement on your storefront; orders and revenue come from Shopify, with subscription renewals left out." />
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
                <tfoot>
                  <tr>
                    <td>Difference</td>
                    <td>{Verschil(c.visitors, t.visitors, "geen")}</td>
                    {c.atc + t.atc > 0 && <td>{Verschil(c.atc, t.atc)}</td>}
                    <td>{Verschil(c.orders, t.orders)}</td>
                    <td>{Verschil(c.revenueCents, t.revenueCents)}</td>
                    <td>{Verschil(c.rpv, t.rpv)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </div>

        {/* ── subscriptions ────────────────────────────────────────────── */}
        <div className="grid grid--2">
            <Card>
              <CardHead
                title="Subscription versus one-off"
                sub="Of the people who bought, how many chose a plan. At a higher price the commitment usually gives way before the purchase does — so this can move while conversion does not."
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
                <div className="grid grid--2" style={{ gap: 16 }}>
                  {([["control", "Control", oc], ["test", "Test", ot]] as const).map(([k, label, o]) => (
                    <div key={k}>
                      <div className="legend__item" style={{ marginBottom: 8 }}>
                        <span className={"swatch swatch--" + k} />{label}
                      </div>
                      <p className="cijfer cijfer--mid">
                        {procent(subAandeel(o), 1)}
                      </p>
                      <p className="small muted" style={{ marginTop: 4 }}>
                        {heel(o.subOrders)} of {heel(o.orders)} orders
                      </p>
                      <div style={{ marginTop: 12 }}>
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
              <CardHead title="What an order looks like"
                         sub="The same revenue can hide a different basket: fewer units at a higher price, or a smaller bundle. This is where that shows." />
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
              sub="Which variant or tier people bought. One that is priced the same in both groups is not part of the test — its orders add noise rather than signal, and this is where you see how much volume goes there."
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
                        <td><Aandeel deel={oc.orders ? oc2 / oc.orders : null} kleur="var(--control)" /></td>
                        <td>{heel(ot2)}</td>
                        <td><Aandeel deel={ot.orders ? ot2 / ot.orders : null} kleur="var(--test)" /></td>
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
        {/* ── wint het overal? ─────────────────────────────────────────── */}
        <Card>
          <CardHead
            title="Does it win everywhere?"
            sub={"The same measure as the verdict — " + doel.naam.toLowerCase() +
                 " — split by segment. A variant that wins overall but loses where most of your traffic is, is not a winner."}
            action={
              <Segmented
                value={dim}
                options={DIMENSIES.map((d) => ({ key: d.key, label: d.label }))}
                onChange={setDim}
              />
            }
          />
          <div className="card__body card__body--flush">
            {!dimensieKan(dim, doel.key) ? (
              <Leeg>{waaromNiet(dim, doel.key)}</Leeg>
            ) : !segmenten.length ? (
              <Leeg>{DIMENSIES.find((d) => d.key === dim)?.leeg}</Leeg>
            ) : (
              <>
                {/* Zonder dit getal lijkt de tabel het hele verkeer te
                    beschrijven. Bij een test die al liep voordat device
                    gemeten werd, beslaat hij daar een fractie van. */}
                {dim === "device" && buitenBeeld > 0 && (
                  <div style={{ padding: "0 24px 14px" }}>
                    <Banner tone="info">
                      Covers {heel(inBeeld)} of {heel(inBeeld + buitenBeeld)} visitors.{" "}
                      {heel(buitenBeeld)} were measured before device tracking was in place, so
                      they cannot be split up — that history does not come back, but everything
                      from here on does.
                    </Banner>
                  </div>
                )}
                {segmenten.some((s) => s.tegendraads) && (
                  <div style={{ padding: "0 24px 14px" }}>
                    <Banner tone="warn">
                      <strong>
                        {segmenten.filter((s) => s.tegendraads).map((s) => s.naam).join(" and ")}{" "}
                        {segmenten.filter((s) => s.tegendraads).length === 1 ? "goes" : "go"} the
                        other way.
                      </strong>{" "}
                      Worth understanding before you roll this out — but not a result on its own.
                      Slicing into segments is the same trap as watching five metrics: check four
                      segments at {betrouwbaarheid}% and roughly one in five tests throws up a false
                      alarm somewhere.
                    </Banner>
                  </div>
                )}
                {/* Waar zit het verkeer eigenlijk?
                    De kop van deze kaart zegt dat een variant die overall wint
                    maar verliest waar het meeste verkeer zit geen winnaar is -
                    en juist dát was in de tabel eronder niet te zien. Zes rijen
                    met percentages laten je optellen; zes balken laten je kijken.
                    Een segment dat verliest op negen procent van je verkeer is
                    iets heel anders dan hetzelfde verlies op zestig. */}
                {segmenten.length > 1 && (
                  <div style={{ padding: "0 24px 20px" }}>
                    <Verdeling
                      rijen={segmenten.map((s, i) => {
                        const n = (s.controle.visitors || s.controle.orders || 0) +
                                  (s.test.visitors || s.test.orders || 0);
                        return {
                          naam: s.naam,
                          waarde: n,
                          toon: heel(n),
                          /* Vier tinten die rouleren. Bewust niet control en
                             test: deze balken tellen beide armen op, en die
                             kleuren zouden hier "arm" suggereren. */
                          kleur: ["var(--wid-blauw)", "var(--wid-teal)",
                                  "var(--wid-roze)", "var(--iris)"][i % 4],
                        };
                      })}
                    />
                  </div>
                )}
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>{DIMENSIES.find((d) => d.key === dim)?.label}</th>
                        <th>{noemerNaam(doel.key)} <span className="muted">control</span></th>
                        <th>{noemerNaam(doel.key)} <span className="muted">test</span></th>
                        <th>{doel.naam} <span className="muted">control</span></th>
                        <th>{doel.naam} <span className="muted">test</span></th>
                        <th>Difference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {segmenten.map((s) => {
                        const wc = doel.waarde(s.controle);
                        const wt = doel.waarde(s.test);
                        const toon = (v: number) =>
                          doel.vorm === "geld" ? geld(v) : v.toFixed(2) + "%";
                        return (
                          <tr key={s.naam} className={s.tegendraads ? "rij--tegendraads" : undefined}>
                            <td>
                              <span className="cell-series">
                                {s.tegendraads && <span className="stip stip--let-op" aria-hidden />}
                                {s.naam}
                              </span>
                            </td>
                            <td>{heel(noemer(doel.key, s.controle))}</td>
                            <td>{heel(noemer(doel.key, s.test))}</td>
                            <td>{noemer(doel.key, s.controle) ? toon(wc) : "—"}</td>
                            <td>{noemer(doel.key, s.test) ? toon(wt) : "—"}</td>
                            <td>
                              {s.toets.bruikbaar
                                ? <Delta waarde={s.toets.lift} />
                                : <span className="muted small">too little data</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </Card>

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
