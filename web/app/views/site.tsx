import { useState } from "react";
import { useSearchParams } from "@remix-run/react";
import { PageHead } from "~/components/shell";
import { Banner, Card, CardHead, Delta, Leeg, Segmented, Track } from "~/components/ui";
import { geld, heel, procent } from "~/lib/analytics";
import type { SiteBereik, SiteData, Rij, Vergelijking } from "~/lib/site.server";
import {
  FILTER_LABEL, schrijfFilters, wisselFilter, type Filter, type FilterSleutel,
} from "~/lib/siteFilters";

/**
 * Bezoekers van de hele winkel, los van de tests.
 *
 * WAT DIT SCHERM ANDERS MAAKT DAN EEN RAPPORT
 * Elke rij is klikbaar en wordt een filter. Daarmee is "Safari is 40%" niet
 * langer een eindpunt maar een vraag: klik erop en het hele scherm - inclusief
 * de trechter en de conversie - herrekent voor alleen die groep.
 *
 * Filters stapelen en staan in de URL, dus een gefilterde weergave is een link
 * die je kunt bewaren of doorsturen.
 *
 * WAT HIER NIET IN ZIT
 * Geen sessieopnames en geen heatmaps. Ander gereedschap, andere opslag, en op
 * deze winkel draait daar al iets voor.
 */

/* ── metriek waarop lijsten worden gelezen ──────────────────────────────── */

type Maat = "sessies" | "bezoekers" | "bounce" | "duur" | "cvr" | "omzet";

const MATEN: { key: Maat; label: string; kort: string }[] = [
  { key: "sessies",   label: "Sessions",   kort: "sessions" },
  { key: "bezoekers", label: "Visitors",   kort: "visitors" },
  { key: "bounce",    label: "Bounce",     kort: "bounce" },
  { key: "duur",      label: "Time",       kort: "time" },
  { key: "cvr",       label: "Conversion", kort: "CVR" },
  { key: "omzet",     label: "Revenue",    kort: "revenue" },
];

const seconden = (ms: number) => {
  const s = Math.round(ms / 1000);
  if (s < 60) return s + "s";
  return Math.floor(s / 60) + "m " + String(s % 60).padStart(2, "0") + "s";
};

/** De waarde van een rij onder de gekozen maat, plus hoe je hem leest. */
function waardeVan(r: Rij, maat: Maat): { getal: number; tekst: string; balk: number } {
  switch (maat) {
    case "bezoekers": return { getal: r.bezoekers, tekst: heel(r.bezoekers), balk: r.bezoekers };
    case "bounce": {
      const p = r.sessies ? (r.bounces / r.sessies) * 100 : 0;
      return { getal: p, tekst: procent(p, 0), balk: p };
    }
    case "duur": {
      const d = r.sessies ? r.duurMs / r.sessies : 0;
      return { getal: d, tekst: seconden(d), balk: d };
    }
    case "cvr": {
      const p = r.sessies ? (r.orders / r.sessies) * 100 : 0;
      return { getal: p, tekst: procent(p, 1), balk: p };
    }
    case "omzet":
      return { getal: r.omzetCents, tekst: geld(r.omzetCents / 100), balk: r.omzetCents };
    default:
      return { getal: r.sessies, tekst: heel(r.sessies), balk: r.sessies };
  }
}

/**
 * Verschil met de vorige periode.
 *
 * Niets tonen als er geen vergelijkbare periode is. Een pijl bij een winkel
 * die net begonnen is met meten suggereert een trend die er niet is.
 */
function Verschil({ nu, toen, omlaagIsGoed }: {
  nu: number; toen?: number | null; omlaagIsGoed?: boolean;
}) {
  if (toen === null || toen === undefined || !toen) return null;
  return <Delta waarde={((nu - toen) / toen) * 100} goedAls={omlaagIsGoed ? "down" : "up"} />;
}

/* ── een lijstje waarvan elke rij een filter wordt ──────────────────────── */

function Lijst({
  rijen, maat, sleutel, actief, opFilter, leeg,
}: {
  rijen: Rij[];
  maat: Maat;
  sleutel: FilterSleutel;
  actief: Filter[];
  opFilter: (f: Filter) => void;
  leeg: string;
}) {
  const [alles, setAlles] = useState(false);
  if (!rijen.length) return <Leeg>{leeg}</Leeg>;

  const zichtbaar = alles ? rijen : rijen.slice(0, 6);
  const top = Math.max(...rijen.map((r) => waardeVan(r, maat).balk), 1);

  return (
    <>
      <div className="balklijst">
        {zichtbaar.map((r) => {
          const w = waardeVan(r, maat);
          const aan = actief.some((f) => f.sleutel === sleutel && f.waarde === r.naam);
          return (
            <button
              type="button"
              className="balkrij"
              key={r.naam}
              aria-pressed={aan}
              onClick={() => opFilter({ sleutel, waarde: r.naam })}
              // De naam staat vooraan in de tooltip: in een smalle kaart wordt
              // hij afgekapt en dan is dit de enige plek waar hij nog heel staat.
              title={
                r.naam + " — " +
                heel(r.sessies) + " sessions · " + heel(r.bezoekers) + " visitors · " +
                procent(r.sessies ? (r.bounces / r.sessies) * 100 : 0, 0) + " bounce · " +
                heel(r.orders) + (r.orders === 1 ? " order" : " orders")
              }
            >
              {/* De balk zit áchter de tekst en binnen de rij, niet ernaast:
                  naast de naam duwt hij de namen in een smalle kolom, en toen
                  hij op de rijbreedte stond liep hij het kader uit. */}
              <span className="balkrij__vulling" style={{ width: (w.balk / top) * 100 + "%" }} />
              <span className="balkrij__naam">{r.naam}</span>
              {r.vorigeSessies > 0 && maat === "sessies" && (
                <span className="balkrij__delta">
                  <Verschil nu={r.sessies} toen={r.vorigeSessies} />
                </span>
              )}
              <span className="balkrij__aantal num">{w.tekst}</span>
            </button>
          );
        })}
      </div>
      {rijen.length > 6 && (
        <button type="button" className="meer" onClick={() => setAlles((a) => !a)}>
          {alles ? "Show less" : "Show all " + rijen.length}
        </button>
      )}
    </>
  );
}

/** Kaart met tabbladen: meerdere dimensies die dezelfde vraag beantwoorden. */
function TabKaart({
  titel, sub, tabs, maat, actief, opFilter,
}: {
  titel: string;
  sub: string;
  tabs: { label: string; sleutel: FilterSleutel; rijen: Rij[]; leeg: string }[];
  maat: Maat;
  actief: Filter[];
  opFilter: (f: Filter) => void;
}) {
  const [tab, setTab] = useState(0);
  const t = tabs[tab];
  return (
    <Card>
      {/* De tabbladen staan onder de kop en niet ernaast. Vier ervan waren
          289px breed in een kaart van 322, en knepen de titel tot nul. Ze
          horen ook inhoudelijk bij de lijst, niet bij de titel. */}
      <CardHead title={titel} sub={sub} />
      {tabs.length > 1 && (
        <div className="tabstrook">
          <div className="minitabs">
            {tabs.map((x, i) => (
              <button key={x.label} type="button" aria-pressed={i === tab}
                      onClick={() => setTab(i)}>{x.label}</button>
            ))}
          </div>
        </div>
      )}
      <div className="card__body card__body--flush">
        <Lijst rijen={t.rijen} maat={maat} sleutel={t.sleutel}
               actief={actief} opFilter={opFilter} leeg={t.leeg} />
      </div>
    </Card>
  );
}

/* ── scherm ─────────────────────────────────────────────────────────────── */

export function SiteView({
  data, filters,
}: {
  data: SiteData;
  filters: Filter[];
}) {
  const [params, setParams] = useSearchParams();
  const bereik = (params.get("d") as SiteBereik) || "7";
  const vergelijking = (params.get("v") as Vergelijking) || "vorige";
  const [maat, setMaat] = useState<Maat>("sessies");
  const [grafiekMaat, setGrafiekMaat] = useState<"bezoekers" | "sessies" | "pageviews" | "orders">("bezoekers");
  // Beide lijsten staan ingeklapt op vijf regels. Dertig padrijen en tien
  // routes uitgeklapt is een halve meter scrollen voor iets waar je meestal
  // alleen de kop van wilt zien.
  const [allePaginas, setAllePaginas] = useState(false);
  const [alleRoutes, setAlleRoutes] = useState(false);

  const zet = (extra: Record<string, string>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(extra)) {
      if (v) p.set(k, v); else p.delete(k);
    }
    setParams(p, { replace: true });
  };

  const opFilter = (f: Filter) => zet({ f: schrijfFilters(wisselFilter(filters, f)) });

  const k = data.kern;
  const v = data.vorige;

  const bounce = k.sessies ? (k.bounces / k.sessies) * 100 : 0;
  const vorigeBounce = v?.sessies ? (v.bounces / v.sessies) * 100 : null;
  const duur = k.sessies ? k.duurMs / k.sessies : 0;
  const vorigeDuur = v?.sessies ? v.duurMs / v.sessies : null;
  const cvr = k.sessies ? (k.orders / k.sessies) * 100 : 0;
  const vorigeCvr = v?.sessies ? (v.orders / v.sessies) * 100 : null;
  const rpv = k.bezoekers ? k.omzetCents / 100 / k.bezoekers : 0;
  const vorigeRpv = v?.bezoekers ? v.omzetCents / 100 / v.bezoekers : null;
  const perSessie = k.sessies ? k.pageviews / k.sessies : 0;

  /**
   * De trechter.
   *
   * Elke stap als aandeel van álle sessies, niet van de stap erboven. Dat
   * laatste gaf "189% of previous", en terecht: dit is geen volgorde. Meer
   * mensen zien een product dan een collectie, omdat advertenties direct op
   * een product landen.
   */
  const stappen = [
    { label: "Sessions", n: k.sessies },
    { label: "Saw a product", n: k.zagProduct },
    { label: "Added to cart", n: k.deedAtc },
    { label: "Started checkout", n: k.gingCheckout },
    { label: "Ordered", n: k.orders },
  ];

  // De echte volgorde zit in product → cart → checkout → order; daar is de
  // grootste val het getal waar het om gaat.
  const volgorde = stappen.slice(2);
  let val: { van: string; naar: string; behouden: number } | null = null;
  for (let i = 1; i < volgorde.length; i++) {
    const a = volgorde[i - 1], b = volgorde[i];
    if (!a.n) continue;
    const behouden = b.n / a.n;
    if (!val || behouden < val.behouden) {
      val = { van: a.label.toLowerCase(), naar: b.label.toLowerCase(), behouden };
    }
  }

  const grafiekWaarde = (p: typeof data.punten[number]) =>
    grafiekMaat === "sessies" ? p.sessies
    : grafiekMaat === "pageviews" ? p.pageviews
    : grafiekMaat === "orders" ? p.orders
    : p.bezoekers;

  const maxPunt = Math.max(...data.punten.map((p) => Math.max(grafiekWaarde(p), p.vorige)), 1);

  return (
    <main className="page">
      <PageHead
        titel="Visitors"
        sub="Everyone on the storefront, whether or not they are in a test."
        actie={
          <div className="rij rij--mid">
            {data.nu > 0 && (
              <span className="live"><span className="live__stip" />{heel(data.nu)} online</span>
            )}
            <Segmented
              value={bereik}
              options={[
                { key: "1" as SiteBereik, label: "Today" },
                { key: "7" as SiteBereik, label: "7d" },
                { key: "30" as SiteBereik, label: "30d" },
                { key: "90" as SiteBereik, label: "90d" },
              ]}
              onChange={(d) => zet({ d })}
            />
          </div>
        }
      />

      <div className="stack">
        {/* ── filters ───────────────────────────────────────────────────── */}
        {filters.length > 0 && (
          <div className="filterchips">
            {filters.map((f) => (
              <button key={f.sleutel + f.waarde} type="button" className="filterchip"
                      onClick={() => opFilter(f)}>
                <span className="filterchip__sleutel">{FILTER_LABEL[f.sleutel]}</span>
                {f.waarde}
                <span className="filterchip__weg" aria-hidden>×</span>
              </button>
            ))}
            <button type="button" className="linkje" onClick={() => zet({ f: "" })}>
              Clear all
            </button>
          </div>
        )}

        {!data.uitSessies && filters.length === 0 && (
          <Banner tone="info">
            Beyond thirty days these come from the daily totals, which are kept for good but are
            summed per dimension. Filtering needs the session detail, so it only works inside the
            thirty-day window.
          </Banner>
        )}

        {!k.sessies ? (
          <Card>
            <Leeg>
              <div style={{ maxWidth: 420 }}>
                <strong style={{ display: "block", marginBottom: 8, color: "var(--ink)" }}>
                  {filters.length ? "Nothing matches those filters" : "Nothing measured yet"}
                </strong>
                {filters.length
                  ? "Try removing one — combining several narrow filters usually leaves nothing."
                  : "Visitor tracking rides along with the Experli snippet in your theme. The first numbers appear within a minute of the next visitor."}
              </div>
            </Leeg>
          </Card>
        ) : (
          <>
            {/* ── kengetallen ───────────────────────────────────────────
             * Eén strook in plaats van zes kaarten. Zes kaarten onder elkaar
             * is duizend pixels scrollen voordat je iets anders ziet, en de
             * hele reden dat je hier komt is één blik op hoe het staat.
             * ──────────────────────────────────────────────────────────── */}
            <div className="kengetallen">
              {[
                { label: "Visitors", waarde: heel(k.bezoekers),
                  noot: heel(k.sessies) + " sessions",
                  delta: <Verschil nu={k.bezoekers} toen={v?.bezoekers} /> },
                { label: "Pageviews", waarde: heel(k.pageviews),
                  noot: perSessie.toFixed(1) + " per session",
                  delta: <Verschil nu={k.pageviews} toen={v?.pageviews} /> },
                { label: "Bounce", waarde: procent(bounce, 0),
                  noot: "one page only",
                  delta: <Verschil nu={bounce} toen={vorigeBounce} omlaagIsGoed /> },
                { label: "Time", waarde: seconden(duur),
                  noot: "per session",
                  delta: <Verschil nu={duur} toen={vorigeDuur} /> },
                { label: "Conversion", waarde: procent(cvr, 1),
                  noot: heel(k.orders) + " orders",
                  delta: <Verschil nu={cvr} toen={vorigeCvr} /> },
                { label: "Revenue", waarde: geld(k.omzetCents / 100),
                  noot: geld(rpv) + " per visitor",
                  delta: <Verschil nu={k.omzetCents} toen={v?.omzetCents} /> },
              ].map((x) => (
                <div className="kengetal" key={x.label}>
                  <span className="kengetal__label">{x.label}</span>
                  <span className="kengetal__rij">
                    <span className="kengetal__waarde num">{x.waarde}</span>
                    {x.delta}
                  </span>
                  <span className="kengetal__noot">{x.noot}</span>
                </div>
              ))}
            </div>

            {/* Grafiek en trechter naast elkaar. Het zijn allebei antwoorden
                op 'hoe staat het ervoor' en je wilt ze in één blik hebben;
                onder elkaar duwden ze de lijsten voorbij de vouw. */}
            <div className="grid grid--paar">
              {/* ── grafiek ─────────────────────────────────────────────── */}
              <Card>
                <CardHead
                  title={data.perUur ? "Through the day" : "Over time"}
                  sub={
                    (data.perUur ? "Per hour, UTC." : "Per day.") +
                    " The pale line is the same length of time before it."
                  }
                  action={
                    <div className="minitabs">
                      {(["bezoekers", "sessies", "pageviews", "orders"] as const).map((m) => (
                        <button key={m} type="button" aria-pressed={grafiekMaat === m}
                                onClick={() => setGrafiekMaat(m)}>
                          {m === "bezoekers" ? "Visitors" : m === "sessies" ? "Sessions"
                            : m === "pageviews" ? "Pageviews" : "Orders"}
                        </button>
                      ))}
                    </div>
                  }
                />
                <div className="card__body">
                  <div className="staafjes">
                    {data.punten.map((p) => {
                      const w = grafiekWaarde(p);
                      return (
                        <div className="staaf" key={p.label}
                             title={p.label + " · " + heel(w) +
                                    (p.vorige ? " (was " + heel(p.vorige) + ")" : "")}>
                          <span className="staaf__vorige"
                                style={{ height: (p.vorige / maxPunt) * 100 + "%" }} />
                          <span className="staaf__nu"
                                style={{ height: (w / maxPunt) * 100 + "%" }} />
                        </div>
                      );
                    })}
                  </div>
                  <div className="staafjes__as">
                    <span>{data.punten[0]?.label}</span>
                    <span>{data.punten[data.punten.length - 1]?.label}</span>
                  </div>
                  <div className="rij rij--mid" style={{ marginTop: 12 }}>
                    <Segmented
                      value={vergelijking}
                      options={[
                        { key: "vorige" as Vergelijking, label: "vs previous period" },
                        { key: "jaar" as Vergelijking, label: "vs last year" },
                      ]}
                      onChange={(x) => zet({ v: x })}
                    />
                  </div>
                </div>
              </Card>

              {/* ── trechter ────────────────────────────────────────────── */}
              <Card>
                <CardHead
                  title="Where visitors drop off"
                  sub={
                    "Cart and checkout come from the actions themselves, not from a page view — " +
                    "this theme opens the cart in a drawer, and Shopify's checkout does not run " +
                    "theme code at all." +
                    (filters.length ? " Recalculated for the filters above." : "")
                  }
                />
                <div className="card__body">
                  {stappen.map((st, i) => {
                    const deel = k.sessies ? st.n / k.sessies : 0;
                    return (
                      <div className="stapregel" key={st.label}>
                        <div className="stapregel__kop">
                          <span className="stapregel__naam">{st.label}</span>
                          <span className="stapregel__cijfers num">
                            <strong>{heel(st.n)}</strong>
                            {i > 0 && (
                              <span className={deel < 0.05 ? "stapregel__val" : "muted"}>
                                {procent(deel * 100, deel < 0.1 ? 1 : 0)} of sessions
                              </span>
                            )}
                          </span>
                        </div>
                        <Track value={deel} color={i === 0 ? "var(--control)" : "var(--iris-lit)"} />
                      </div>
                    );
                  })}
                  {val && (
                    <p className="small muted" style={{ marginTop: 16 }}>
                      The steepest fall is between <strong>{val.van}</strong> and{" "}
                      <strong>{val.naar}</strong>: {procent(val.behouden * 100, 0)} of the people who
                      got that far carried on.
                    </p>
                  )}
                </div>
              </Card>
            </div>

            {/* ── lijsten ─────────────────────────────────────────────── */}
            <div className="lijstkop">
              <span className="lijstkop__label">Read the lists by</span>
              <div className="minitabs">
                {MATEN.map((m) => (
                  <button key={m.key} type="button" aria-pressed={maat === m.key}
                          onClick={() => setMaat(m.key)}>{m.label}</button>
                ))}
              </div>
              <span className="small muted lijstkop__hint">
                Click any row to filter everything above by it.
              </span>
            </div>

            {/* Vier kaarten in één rij. Op --2 werden het er drie naast
                elkaar en bleef de vierde alleen achter met een gat ernaast. */}
            <div className="grid grid--4">
              <TabKaart
                titel="Where they come from"
                sub="Channel first; the UTM tabs show what your campaigns actually carried."
                maat={maat} actief={filters} opFilter={opFilter}
                tabs={[
                  { label: "Source", sleutel: "bron", rijen: data.bronnen, leeg: "No sources yet." },
                  { label: "UTM source", sleutel: "utm_source", rijen: data.utmSource, leeg: "No utm_source tags seen." },
                  { label: "Medium", sleutel: "utm_medium", rijen: data.utmMedium, leeg: "No utm_medium tags seen." },
                  { label: "Campaign", sleutel: "utm_campaign", rijen: data.utmCampagne, leeg: "No utm_campaign tags seen." },
                ]}
              />

              <TabKaart
                titel="Devices"
                sub="Device from the screen width; browser and system reported by the browser itself."
                maat={maat} actief={filters} opFilter={opFilter}
                tabs={[
                  { label: "Device", sleutel: "device", rijen: data.devices, leeg: "No devices yet." },
                  { label: "Browser", sleutel: "browser", rijen: data.browsers, leeg: "No browsers yet." },
                  { label: "System", sleutel: "os", rijen: data.besturing, leeg: "No systems yet." },
                ]}
              />

              <TabKaart
                titel="Pages"
                sub="Entry pages are where sessions started; exit pages where they ended."
                maat={maat} actief={filters} opFilter={opFilter}
                tabs={[
                  { label: "Entry", sleutel: "instap", rijen: data.instappen, leeg: "No entry pages yet." },
                  { label: "Exit", sleutel: "uitstap", rijen: data.uitstappen, leeg: "No exit pages yet." },
                ]}
              />

              <TabKaart
                titel="Who they are"
                sub="Country from Shopify's localisation. New means no earlier visit was seen."
                maat={maat} actief={filters} opFilter={opFilter}
                tabs={[
                  { label: "Country", sleutel: "country", rijen: data.landen, leeg: "No countries yet." },
                  { label: "New vs returning", sleutel: "nieuw", rijen: data.nieuwTerug, leeg: "Not enough visits yet." },
                ]}
              />
            </div>

            {/* ── pagina's en routes ────────────────────────── */}
            <div className="grid grid--paar">
              <Card>
                <CardHead
                  title="Every page"
                  sub="Bounce counts sessions that started here and saw nothing else. Time and scroll are measured on the page a session left from - the only page we know they finished with."
                />
                <div className="card__body card__body--flush table-scroll">
                  <table className="tabel--paden">
                    <thead>
                      <tr>
                        <th>Page</th><th>Views</th><th>Entries</th><th>Exits</th>
                        <th>Bounce</th><th>Time</th><th>Scrolled</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(allePaginas ? data.paginas : data.paginas.slice(0, 5)).map((p) => {
                        const bounce = p.instappen ? (p.bounces / p.instappen) * 100 : null;
                        return (
                          <tr key={p.path}>
                            <td>
                              <button type="button" className="linkje" title={p.path}
                                      onClick={() => opFilter({ sleutel: "pad", waarde: p.path })}>
                                <code>{p.path}</code>
                              </button>
                            </td>
                            <td>{heel(p.pageviews)}</td>
                            <td>{heel(p.instappen)}</td>
                            <td>{heel(p.uitstappen)}</td>
                            {/* Bounce zonder instappen bestaat niet - dan is er niemand
                                binnengekomen om te kunnen vertrekken. */}
                            <td>
                              {bounce === null ? <span className="muted">—</span>
                                : <span className={bounce >= 70 ? "stapregel__val" : undefined}>
                                    {procent(bounce, 0)}
                                  </span>}
                            </td>
                            <td>{p.gemSec ? seconden(p.gemSec * 1000) : <span className="muted">—</span>}</td>
                            <td>{p.gemScroll ? procent(p.gemScroll, 0) : <span className="muted">—</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {data.paginas.length > 5 && (
                  <button type="button" className="meer" onClick={() => setAllePaginas((a) => !a)}>
                    {allePaginas ? "Show less" : "Show all " + data.paginas.length + " pages"}
                  </button>
                )}
              </Card>

              {data.routes.length > 0 && (
                <Card>
                  <CardHead
                    title="Most walked routes"
                    sub="The first four pages of a session. Longer than that and every route is unique, which tells you nothing."
                  />
                  <div className="card__body card__body--flush">
                    <div className="balklijst">
                      {(alleRoutes ? data.routes : data.routes.slice(0, 5)).map((r) => (
                        <div className="balkrij balkrij--stil balkrij--route" key={r.route}>
                          <span className="balkrij__vulling"
                                style={{ width: (r.sessies / (data.routes[0]?.sessies || 1)) * 100 + "%" }} />
                          <span className="balkrij__naam"><code>{r.route}</code></span>
                          {r.orders > 0 && (
                            <span className="balkrij__delta small">
                              {heel(r.orders)} {r.orders === 1 ? "order" : "orders"}
                            </span>
                          )}
                          <span className="balkrij__aantal num">{heel(r.sessies)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {data.routes.length > 5 && (
                    <button type="button" className="meer" onClick={() => setAlleRoutes((a) => !a)}>
                      {alleRoutes ? "Show less" : "Show all " + data.routes.length + " routes"}
                    </button>
                  )}
                </Card>
              )}
            </div>

            <Banner tone="info">
              <strong>Session detail is kept for thirty days; the daily totals stay for good.</strong>{" "}
              This database is shared with your popup and bundle apps, so storing every pageview
              forever is not free — one row per session, rolled up nightly, keeps the history
              without the weight. Filtering works inside those thirty days.
              {data.detailTot && " Detail currently goes back to " + data.detailTot + "."}
            </Banner>
          </>
        )}
      </div>
    </main>
  );
}
