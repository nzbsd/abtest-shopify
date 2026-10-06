import { useEffect, useRef, useState } from "react";
import { Link } from "@remix-run/react";
import { PageHead } from "~/components/shell";
import { Banner, Card, CardHead, Leeg } from "~/components/ui";
import { geld, heel } from "~/lib/analytics";
import type { LiveGroep, LiveMens, LiveStap, LiveTest, TestLiveData } from "~/lib/testLive.server";

/**
 * Live per A/B-test: wie zit er nu in welke variant, en hoe ver is hij.
 *
 * Tien seconden tussen rondes. Op de achtergrond niets vragen; bij terugkomst
 * meteen. Een gemiste ronde laat het vorige beeld staan in plaats van het
 * scherm leeg te maken - een gat in de verbinding is geen leeg winkelbezoek.
 */

const TUSSENPOOS = 10_000;

function usePeilen(basis: string, begin: TestLiveData): { d: TestLiveData; vers: boolean } {
  const [d, setD] = useState<TestLiveData>(begin);
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
        if (!r.ok) { setVers(false); return; }
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
    plan();

    return () => {
      gestopt.current = true;
      clearTimeout(klok);
      document.removeEventListener("visibilitychange", opZicht);
    };
  }, [basis]);

  return { d, vers };
}

const STAP: Record<LiveStap, { label: string; rang: number }> = {
  bekijkt:    { label: "Browsing",        rang: 0 },
  cart:       { label: "Added to cart",   rang: 1 },
  kassa:      { label: "In checkout",     rang: 2 },
  contact:    { label: "Checkout · contact",  rang: 3 },
  verzending: { label: "Checkout · shipping", rang: 4 },
  betaling:   { label: "Checkout · payment",  rang: 5 },
  gekocht:    { label: "Purchased",       rang: 6 },
};

function geleden(sec: number): string {
  if (sec < 60) return sec + "s ago";
  const m = Math.floor(sec / 60);
  return m + "m ago";
}

export function TestLiveView({ begin, basis }: { begin: TestLiveData; basis: string }) {
  const { d, vers } = usePeilen(basis, begin);
  const tijd = new Date(d.op).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <main className="page">
      <PageHead
        titel="Live tests"
        sub="Who is in which variant right now — browsing, cart, checkout, purchased. Updates every 10 seconds."
        actie={
          <span className={"live-stip" + (vers ? "" : " live-stip--oud")} title={vers ? "Live" : "Connection lost — showing last data"}>
            <span className="dot" /> {vers ? "Live" : "Paused"} · {tijd}
          </span>
        }
      />

      <div className="stack">
        {d.fout && (
          <Banner tone="error">
            <strong>Live data unavailable.</strong>
            <div style={{ marginTop: 6 }}><code>{d.fout}</code></div>
          </Banner>
        )}

        {!d.fout && !d.tests.length && (
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

        {d.tests.map((t) => <TestKaart key={t.id} t={t} />)}

        <p className="live-voet">
          “Now” means active in the last 5 minutes; cart, checkout and purchased cover the last
          15 minutes. Checkout steps come from the web pixel and only appear for visitors who
          allowed analytics. Purchases are web-store orders only — subscription renewals are not
          counted. Visitors are shown as a short code, never by name or customer number.
        </p>
      </div>
    </main>
  );
}

function TestKaart({ t }: { t: LiveTest }) {
  const c = t.groepen.control;
  const te = t.groepen.test;
  return (
    <Card className="live-test">
      <CardHead
        title={t.naam}
        sub={t.type + " test · " + t.split + "% in the test group" +
          (t.paden.length ? " · " + t.paden.join(" vs ") : "")}
      />
      <div className="live-armen">
        <Arm naam="Control" kleur="control" g={c} />
        <Arm naam="Test" kleur="test" g={te} />
      </div>
      <Mensen mensen={t.mensen} />
    </Card>
  );
}

function Arm({ naam, kleur, g }: { naam: string; kleur: "control" | "test"; g: LiveGroep }) {
  const rij = (label: string, waarde: string, sub?: string) => (
    <div className="live-cijfer">
      <span className="live-cijfer__label">{label}</span>
      <span className="live-cijfer__waarde num">{waarde}</span>
      {sub && <span className="live-cijfer__sub">{sub}</span>}
    </div>
  );
  return (
    <section className={"live-arm live-arm--" + kleur}>
      <header className="live-arm__kop">
        <span className={"swatch swatch--" + kleur} />
        <strong>{naam}</strong>
      </header>
      <div className="live-arm__cijfers">
        {rij("Online now", heel(g.nu), heel(g.opPagina) + " on the test page")}
        {rij("Added to cart", heel(g.cart), "last 15 min")}
        {rij("In checkout", heel(g.kassa), "last 15 min")}
        {rij("Purchased", heel(g.gekocht), g.gekocht ? geld(g.omzet / 100) + " · last 15 min" : "last 15 min")}
        {rij("Today", heel(g.vandaagOrders) + " orders",
          geld(g.vandaagOmzet / 100) + (g.vandaagAbo ? " · " + heel(g.vandaagAbo) + " with subscription" : ""))}
      </div>
    </section>
  );
}

function Mensen({ mensen }: { mensen: LiveMens[] }) {
  if (!mensen.length) {
    return <p className="live-leeg">Nobody in this test in the last 15 minutes.</p>;
  }
  const gesorteerd = [...mensen].sort(
    (a, b) => STAP[b.stap].rang - STAP[a.stap].rang || a.sec - b.sec,
  );
  return (
    <div className="table-scroll">
      <table className="live-tabel">
        <thead>
          <tr>
            <th>Visitor</th>
            <th>Variant</th>
            <th>Where</th>
            <th>Page</th>
            <th>Device</th>
            <th>Last seen</th>
          </tr>
        </thead>
        <tbody>
          {gesorteerd.map((m) => (
            <tr key={m.wie + m.groep}>
              <td>
                <code>{m.wie}</code>
                {m.klant && <span className="pill pill--draft" style={{ marginLeft: 6 }}>customer</span>}
              </td>
              <td>
                <span className="cell-series">
                  <span className={"swatch swatch--" + m.groep} />
                  {m.groep === "test" ? "Test" : "Control"}
                </span>
              </td>
              <td>
                <span className={"live-stap live-stap--" + m.stap}>{STAP[m.stap]?.label ?? m.stap}</span>
                {m.stap === "gekocht" && m.cents > 0 && (
                  <span className="live-bedrag num"> {geld(m.cents / 100)}{m.abo ? " · sub" : ""}</span>
                )}
              </td>
              <td className="live-pad" title={m.pagina ?? ""}>{m.pagina ?? "—"}</td>
              <td>{[m.land, m.device].filter(Boolean).join(" · ") || "—"}</td>
              <td className="num">{geleden(m.sec)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
