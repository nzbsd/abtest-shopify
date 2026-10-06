import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@remix-run/react";
import { PageHead } from "~/components/shell";
import { Banner, Card, CardHead, Leeg } from "~/components/ui";
import { geld, heel } from "~/lib/analytics";
import type { LiveGroep, LiveMens, LiveStap, LiveTest, TestLiveData } from "~/lib/testLive.server";

/**
 * Live per A/B-test: wie zit er nu in welke variant, en hoe ver is hij.
 *
 * Opbouw volgens de dashboard-skill: één cijferpaar als held (nu online), de
 * trechter als rijen met balken in plaats van vijf losse cijfers, en de mensen
 * per variant naast elkaar. Kleur alleen waar hij control of test betekent; de
 * stappen zijn een neutrale meter, behalve "gekocht", dat is status.
 *
 * Tien seconden tussen rondes. Op de achtergrond niets vragen; bij terugkomst
 * meteen. Een gemiste ronde laat het vorige beeld staan in plaats van het
 * scherm leeg te maken - een gat in de verbinding is geen leeg winkelbezoek.
 */

const TUSSENPOOS = 10_000;

/**
 * Zonder `begin` (de tab op Analytics heeft geen eigen loader) wordt er
 * meteen opgehaald in plaats van na tien seconden.
 */
function usePeilen(basis: string, begin: TestLiveData | null): { d: TestLiveData | null; vers: boolean } {
  const [d, setD] = useState<TestLiveData | null>(begin);
  const [vers, setVers] = useState(true);
  const gestopt = useRef(false);

  useEffect(() => {
    gestopt.current = false;
    let klok = 0;

    const haal = async () => {
      try {
        const r = await fetch(basis + "/ab-live-data", {
          headers: { Accept: "application/json" },
          credentials: "same-origin",
        });
        if (!r.ok) { if (!gestopt.current) setVers(false); return; }
        const nieuw = (await r.json()) as TestLiveData;
        if (!gestopt.current) { setD(nieuw); setVers(true); }
      } catch {
        if (!gestopt.current) setVers(false);
      }
    };

    const plan = () => {
      klok = window.setTimeout(async () => {
        if (!document.hidden) await haal();
        if (!gestopt.current) plan();
      }, TUSSENPOOS);
    };
    const opZicht = () => { if (!document.hidden) haal(); };
    document.addEventListener("visibilitychange", opZicht);
    if (!begin) haal();
    plan();

    return () => {
      gestopt.current = true;
      clearTimeout(klok);
      document.removeEventListener("visibilitychange", opZicht);
    };
    // `begin` alleen bij het eerste renderen; daarna is de hook de bron.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basis]);

  return { d, vers };
}

/* ── stappen ─────────────────────────────────────────────────────────────── */

const STAP: Record<LiveStap, { label: string; meter: number }> = {
  bekijkt:    { label: "Browsing",      meter: 0 },
  cart:       { label: "In cart",       meter: 1 },
  kassa:      { label: "Checkout",      meter: 2 },
  contact:    { label: "Contact",       meter: 2 },
  verzending: { label: "Shipping",      meter: 3 },
  betaling:   { label: "Payment",       meter: 3 },
  gekocht:    { label: "Purchased",     meter: 4 },
};

function geleden(sec: number): string {
  if (sec < 60) return "now";
  return Math.floor(sec / 60) + "m";
}

function tijdVan(op: string): string {
  return new Date(op).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function Status({ op, vers }: { op: string; vers: boolean }) {
  return (
    <span className={"live-status" + (vers ? "" : " live-status--oud")}
          title={vers ? "Updates every 10 seconds" : "Connection lost — showing the last data"}>
      <span className="live-status__stip" />
      {vers ? "Live" : "Paused"} <span className="live-status__tijd num">{tijdVan(op)}</span>
    </span>
  );
}

/* ── de pagina ───────────────────────────────────────────────────────────── */

export function TestLiveView({ begin, basis }: { begin: TestLiveData; basis: string }) {
  const { d, vers } = usePeilen(basis, begin);
  const data = d ?? begin;

  return (
    <main className="page">
      <PageHead
        titel="Live tests"
        sub="Who is in which variant right now, and how far they got."
        actie={<Status op={data.op} vers={vers} />}
      />

      <div className="stack">
        {data.fout && (
          <Banner tone="error">
            <strong>Live data unavailable.</strong>
            <div style={{ marginTop: 6 }}><code>{data.fout}</code></div>
          </Banner>
        )}

        {!data.fout && !data.tests.length && (
          <Card>
            <Leeg>
              <div style={{ maxWidth: 380 }}>
                <strong style={{ display: "block", marginBottom: 8, color: "var(--ink)" }}>
                  No test is running
                </strong>
                Start a test and this page shows who is in each variant as it happens.
                <div style={{ marginTop: 16 }}>
                  <Link className="btn btn--iris" to={basis + "/tests"}>Go to Tests</Link>
                </div>
              </div>
            </Leeg>
          </Card>
        )}

        {data.tests.map((t) => <TestKaart key={t.id} t={t} />)}

        <Voetnoot />
      </div>
    </main>
  );
}

/**
 * Het live-blok van één test, voor de tab op Analytics. Haalt zelf op; de
 * analytics-loader rekent al genoeg.
 */
export function LiveBlok({ testId, basis }: { testId: number; basis: string }) {
  const { d, vers } = usePeilen(basis, null);
  if (!d) return <Card><p className="live-leeg">Loading live data…</p></Card>;
  if (d.fout) {
    return (
      <Banner tone="error">
        <strong>Live data unavailable.</strong>
        <div style={{ marginTop: 6 }}><code>{d.fout}</code></div>
      </Banner>
    );
  }
  const t = d.tests.find((x) => x.id === testId);
  if (!t) {
    return <Card><Leeg>This test is not running, so there is nobody to show.</Leeg></Card>;
  }
  return (
    <div className="stack stack--strak">
      <TestKaart t={t} status={<Status op={d.op} vers={vers} />} />
      <Voetnoot />
    </div>
  );
}

function Voetnoot() {
  return (
    <p className="live-voet">
      “Online” is the last 5 minutes; cart, checkout and purchased the last 15. Checkout steps
      come from the web pixel and only show for visitors who allowed analytics. Purchases are
      web-store orders only — subscription renewals are not counted. Visitors are a short code,
      never a name or customer number.
    </p>
  );
}

/* ── één test ────────────────────────────────────────────────────────────── */

function TestKaart({ t, status }: { t: LiveTest; status?: ReactNode }) {
  const c = t.groepen.control;
  const te = t.groepen.test;
  return (
    <Card className="live-kaart">
      <CardHead
        title={t.naam}
        sub={t.type + " test · " + t.split + "% in the test group"}
        action={status}
      />

      <div className="live-kaart__boven">
        <Online c={c} t={te} />
        <Trechter c={c} t={te} />
      </div>

      <Vandaag c={c} t={te} />

      <div className="live-kaart__mensen">
        <Mensen groep="control" naam="Control" mensen={t.mensen} paden={t.paden} />
        <Mensen groep="test" naam="Test" mensen={t.mensen} paden={t.paden} />
      </div>
    </Card>
  );
}

/** Het cijferpaar dat de vraag beantwoordt waarvoor je hier komt. */
function Online({ c, t }: { c: LiveGroep; t: LiveGroep }) {
  const kant = (naam: string, kleur: "control" | "test", g: LiveGroep) => (
    <div className="live-online__kant">
      <span className="legend__item"><span className={"swatch swatch--" + kleur} />{naam}</span>
      <p className="live-online__cijfer num">{heel(g.nu)}</p>
      <p className="live-online__noot">{heel(g.opPagina)} on the test page</p>
    </div>
  );
  return (
    <section className="live-online">
      <p className="live-label">Online now</p>
      <div className="live-online__paar">
        {kant("Control", "control", c)}
        {kant("Test", "test", t)}
      </div>
    </section>
  );
}

/** Cart, kassa, gekocht: per stap twee balken op dezelfde schaal. */
function Trechter({ c, t }: { c: LiveGroep; t: LiveGroep }) {
  const rijen = [
    { label: "In cart", c: c.cart, t: t.cart, toon: heel },
    { label: "In checkout", c: c.kassa, t: t.kassa, toon: heel },
    { label: "Purchased", c: c.gekocht, t: t.gekocht, toon: heel },
  ];
  return (
    <section className="live-trechter">
      <p className="live-label">Last 15 minutes</p>
      {rijen.map((r) => {
        const top = Math.max(r.c, r.t, 1);
        return (
          <div className="live-rij" key={r.label}>
            <span className="live-rij__naam">{r.label}</span>
            <span className="live-rij__balk">
              <span style={{ width: (r.c / top) * 100 + "%", background: "var(--control)" }} />
            </span>
            <span className="live-rij__getal num">{r.toon(r.c)}</span>
            <span className="live-rij__balk">
              <span style={{ width: (r.t / top) * 100 + "%", background: "var(--test)" }} />
            </span>
            <span className="live-rij__getal num">{r.toon(r.t)}</span>
          </div>
        );
      })}
    </section>
  );
}

function Vandaag({ c, t }: { c: LiveGroep; t: LiveGroep }) {
  const deel = (g: LiveGroep) =>
    heel(g.vandaagOrders) + " orders · " + geld(g.vandaagOmzet / 100) +
    (g.vandaagAbo ? " · " + heel(g.vandaagAbo) + " with subscription" : "");
  return (
    <div className="live-vandaag">
      <span className="live-label">Today</span>
      <span className="live-vandaag__kant">
        <span className="swatch swatch--control" />{deel(c)}
      </span>
      <span className="live-vandaag__kant">
        <span className="swatch swatch--test" />{deel(t)}
      </span>
    </div>
  );
}

/* ── wie er is ───────────────────────────────────────────────────────────── */

const ZICHTBAAR_KIJKEND = 5;

function paginaNaam(pad: string | null, paden: string[]): string {
  if (!pad) return "—";
  if (paden[0] && (pad === paden[0] || pad.endsWith(paden[0]))) return "Original page";
  if (paden[1] && (pad === paden[1] || pad.endsWith(paden[1]))) return "Test page";
  if (pad === "/") return "Home";
  if (pad.startsWith("/cart")) return "Cart";
  return pad.replace(/^\/(products|pages|collections|blogs)\//, "");
}

function Mensen({
  groep, naam, mensen, paden,
}: { groep: "control" | "test"; naam: string; mensen: LiveMens[]; paden: string[] }) {
  const [alles, setAlles] = useState(false);
  const eigen = mensen
    .filter((m) => m.groep === groep)
    .sort((a, b) => STAP[b.stap].meter - STAP[a.stap].meter || a.sec - b.sec);

  // Wie verder is dan kijken staat er altijd; van de kijkers een handvol. Zestig
  // regels "Browsing" duwen de drie mensen in de kassa uit beeld.
  const actief = eigen.filter((m) => m.stap !== "bekijkt");
  const kijkers = eigen.filter((m) => m.stap === "bekijkt");
  const toon = alles ? kijkers : kijkers.slice(0, ZICHTBAAR_KIJKEND);
  const verborgen = kijkers.length - toon.length;

  return (
    <section className="live-groep">
      <header className="live-groep__kop">
        <span className="legend__item"><span className={"swatch swatch--" + groep} />{naam}</span>
        <span className="live-groep__aantal num">{heel(eigen.length)} in the last 15 min</span>
      </header>

      {!eigen.length && <p className="live-leeg">Nobody right now.</p>}

      <ul className="live-lijst">
        {[...actief, ...toon].map((m) => (
          <li key={m.wie} className="live-mens">
            <Meter n={STAP[m.stap].meter} gekocht={m.stap === "gekocht"} />
            <span className="live-mens__stap">{STAP[m.stap].label}</span>
            <span className="live-mens__pagina" title={m.pagina ?? ""}>{paginaNaam(m.pagina, paden)}</span>
            <span className="live-mens__meta num">
              {m.stap === "gekocht" && m.cents > 0 && (
                <span className="live-mens__bedrag">{geld(m.cents / 100)}{m.abo ? " · sub" : ""}</span>
              )}
              {[m.land, m.device].filter(Boolean).join(" · ")}
              <span className="live-mens__tijd">{geleden(m.sec)}</span>
            </span>
          </li>
        ))}
      </ul>

      {verborgen > 0 && (
        <button type="button" className="live-meer" onClick={() => setAlles(true)}>
          + {heel(verborgen)} more browsing
        </button>
      )}
    </section>
  );
}

/** Vier streepjes: cart, kassa, betalen, gekocht. Neutraal, behalve gekocht. */
function Meter({ n, gekocht }: { n: number; gekocht: boolean }) {
  return (
    <span className={"live-meter" + (gekocht ? " live-meter--gekocht" : "")} aria-hidden>
      {[1, 2, 3, 4].map((i) => <span key={i} className={i <= n ? "aan" : ""} />)}
    </span>
  );
}
