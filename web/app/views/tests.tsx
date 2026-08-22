import { useFetcher } from "@remix-run/react";
import { useMemo, useState } from "react";
import { PageHead } from "~/components/shell";
import {
  Badge, Banner, Card, CardHead, Delta, IconAlert, IconCheck, Leeg,
} from "~/components/ui";
import { geld, heel, looptDagen } from "~/lib/analytics";
import { matchVariants, prijsVergelijking, type ProductInfo } from "~/lib/variants";
import type { PriceTest } from "~/lib/priceTest.server";

/* ── productkiezer ──────────────────────────────────────────────────────── */

function Kiezer({
  label, hint, producten, gekozen, onKies, uitsluiten,
}: {
  label: string;
  hint: string;
  producten: ProductInfo[];
  gekozen: ProductInfo | null;
  onKies: (p: ProductInfo | null) => void;
  uitsluiten?: string;
}) {
  const [zoek, setZoek] = useState("");

  const zichtbaar = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    return producten
      .filter((p) => p.id !== uitsluiten)
      .filter((p) => !q || p.title.toLowerCase().includes(q) || p.handle.includes(q))
      .slice(0, 40);
  }, [producten, zoek, uitsluiten]);

  if (gekozen) {
    const laagste = Math.min(...gekozen.variants.map((v) => parseFloat(v.price) || 0));
    return (
      <div className="field">
        <span className="field__label">{label}</span>
        <div className="picker__item" aria-pressed="true" style={{ cursor: "default" }}>
          {gekozen.image
            ? <img className="picker__img" src={gekozen.image} alt="" />
            : <span className="picker__img" />}
          <span className="picker__body">
            <span className="picker__title">{gekozen.title}</span>
            <span className="picker__meta num">
              {gekozen.variants.length} variant(en) · vanaf {geld(laagste)}
            </span>
          </span>
          <button type="button" className="btn btn--sm" onClick={() => onKies(null)}>Wijzig</button>
        </div>
      </div>
    );
  }

  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <input
        type="search"
        placeholder="Zoek op naam of handle"
        value={zoek}
        onChange={(e) => setZoek(e.target.value)}
        style={{ marginBottom: 10 }}
      />
      <div className="picker">
        {!zichtbaar.length && <p className="small muted" style={{ padding: 8 }}>Geen product gevonden.</p>}
        {zichtbaar.map((p) => {
          const laagste = Math.min(...p.variants.map((v) => parseFloat(v.price) || 0));
          return (
            <button key={p.id} type="button" className="picker__item" onClick={() => onKies(p)}>
              {p.image ? <img className="picker__img" src={p.image} alt="" /> : <span className="picker__img" />}
              <span className="picker__body">
                <span className="picker__title">{p.title}</span>
                <span className="picker__meta num">
                  {p.variants.length} variant(en) · vanaf {geld(laagste)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <span className="field__hint">{hint}</span>
    </div>
  );
}

/* ── scherm ─────────────────────────────────────────────────────────────── */

export function TestsView({
  tests, producten, fout,
}: {
  tests: PriceTest[];
  producten: ProductInfo[];
  fout: string | null;
}) {
  const fetcher = useFetcher<{ ok: boolean; bericht: string }>();
  const bezig = fetcher.state !== "idle";

  const [open, setOpen] = useState(false);
  const [control, setControl] = useState<ProductInfo | null>(null);
  const [test, setTest] = useState<ProductInfo | null>(null);
  const [split, setSplit] = useState("50");

  // Koppeling en prijsverschil live berekenen met exact dezelfde functie die de
  // server straks gebruikt, zodat wat je ziet ook is wat er wordt opgeslagen.
  const koppeling = control && test ? matchVariants(control, test) : null;
  const vergelijking = control && test && koppeling
    ? prijsVergelijking(control, test, koppeling.pairs)
    : [];

  const gelijkePrijs = vergelijking.length > 0 && vergelijking.every((v) => Math.abs(v.verschil) < 0.005);

  const opslaan = () => {
    if (!control || !test) return;
    const fd = new FormData();
    fd.set("intent", "save");
    fd.set("control", control.id);
    fd.set("test", test.id);
    fd.set("split", split);
    fetcher.submit(fd, { method: "post" });
    setOpen(false);
    setControl(null);
    setTest(null);
  };

  const actie = (id: number, intent: "start" | "stop" | "delete") => {
    const fd = new FormData();
    fd.set("intent", intent);
    fd.set("id", String(id));
    fetcher.submit(fd, { method: "post" });
  };

  return (
    <main className="page">
      <PageHead
        titel="Tests"
        sub="Welk product tegen welk duplicaat, en hoe het verkeer verdeeld wordt."
        actie={
          <button className={"btn " + (open ? "" : "btn--iris")} onClick={() => setOpen((v) => !v)}>
            {open ? "Annuleren" : "Nieuwe test"}
          </button>
        }
      />

      <div className="stack">
        {fout && (
          <Banner tone="error">
            <strong>Configuratie niet compleet.</strong>
            <div style={{ marginTop: 6 }}><code>{fout}</code></div>
          </Banner>
        )}

        {fetcher.data?.bericht && (
          <Banner tone={fetcher.data.ok ? "ok" : "error"}>{fetcher.data.bericht}</Banner>
        )}

        {open && (
          <Card>
            <CardHead
              title="Nieuwe test"
              sub="Het origineel is de controlegroep, het duplicaat de testgroep."
            />
            <div className="card__body">
              <Banner tone="warn">
                Maak eerst in Shopify een duplicaat van het product en zet daar de nieuwe prijs op —
                per markt zoals je wilt. Koppel er ook je <strong>bundel, selling plan en reviews</strong> aan;
                vergeet je er een, dan meet je dát verschil in plaats van de prijs.
              </Banner>

              <div className="row" style={{ marginTop: 20 }}>
                <Kiezer
                  label="Origineel — controlegroep"
                  hint="Het product waar bezoekers nu op binnenkomen."
                  producten={producten}
                  gekozen={control}
                  onKies={setControl}
                  uitsluiten={test?.id}
                />
                <Kiezer
                  label="Duplicaat — testgroep"
                  hint="Hetzelfde product met de prijs die je wilt testen."
                  producten={producten}
                  gekozen={test}
                  onKies={setTest}
                  uitsluiten={control?.id}
                />
              </div>

              {koppeling && (
                <div style={{ marginTop: 24 }}>
                  <span className="field__label">Wat er gekoppeld wordt</span>

                  {gelijkePrijs && (
                    <div style={{ marginBottom: 12 }}>
                      <Banner tone="warn">
                        Beide producten hebben dezelfde prijs. Zo meet je niets — zet eerst de
                        nieuwe prijs op het duplicaat.
                      </Banner>
                    </div>
                  )}

                  {koppeling.unmatched.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <Banner tone="error">
                        <strong>Niet gekoppeld:</strong> {koppeling.unmatched.join(", ")}. Die
                        varianten vallen buiten de test en houden gewoon hun eigen prijs.
                      </Banner>
                    </div>
                  )}

                  <div className="table-scroll card" style={{ boxShadow: "none", border: "1px solid var(--line)" }}>
                    <table>
                      <thead>
                        <tr><th>Variant</th><th>Nu</th><th>Test</th><th>Verschil</th></tr>
                      </thead>
                      <tbody>
                        {vergelijking.map((v) => (
                          <tr key={v.titel}>
                            <td>{v.titel}</td>
                            <td className="num">{geld(v.oud)}</td>
                            <td className="num"><strong>{geld(v.nieuw)}</strong></td>
                            <td>
                              {Math.abs(v.verschil) < 0.005
                                ? <span className="muted">gelijk</span>
                                : <Delta waarde={v.procent} goedAls="geen" />}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="field" style={{ maxWidth: 280, marginTop: 22 }}>
                <span className="field__label">Percentage in de testgroep</span>
                <input type="number" min={1} max={99} value={split}
                       onChange={(e) => setSplit(e.target.value)} />
                <span className="field__hint">De rest is de controlegroep. 50 is bijna altijd het beste.</span>
              </div>

              <div style={{ marginTop: 22, display: "flex", gap: 10 }}>
                <button className="btn btn--iris" onClick={opslaan}
                        disabled={!control || !test || !koppeling?.pairs.length || bezig}>
                  {bezig ? "Bezig…" : "Test opslaan"}
                </button>
                <button className="btn" onClick={() => setOpen(false)}>Annuleren</button>
              </div>
            </div>
          </Card>
        )}

        <Card>
          <CardHead title="Alle tests" />
          <div className="card__body card__body--flush">
            {!tests.length && <Leeg>Nog geen tests aangemaakt.</Leeg>}
            {tests.map((t) => {
              const dagen = looptDagen(t.started_at);
              return (
                <div className="test-row" key={t.id}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <strong>{t.control_title || t.control_product_id}</strong>
                      <Badge status={t.status} />
                    </div>
                    <div className="pair">
                      <span className="legend__item"><span className="swatch swatch--control" />origineel</span>
                      <span>→</span>
                      <span className="legend__item">
                        <span className="swatch swatch--test" /><code>{t.test_product_handle}</code>
                      </span>
                    </div>
                    <p className="small muted" style={{ marginTop: 6 }}>
                      {t.split_pct}% in de testgroep · {heel((t.variant_map || []).length)} variant(en) gekoppeld
                      {dagen !== null && t.status === "running" ? " · loopt " + dagen + " dagen" : ""}
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {t.status === "running" ? (
                      <button className="btn btn--danger" disabled={bezig} onClick={() => actie(t.id, "stop")}>
                        Stoppen
                      </button>
                    ) : (
                      <button className="btn btn--iris" disabled={bezig} onClick={() => actie(t.id, "start")}>
                        Starten
                      </button>
                    )}
                    {t.status !== "running" && (
                      <button
                        className="btn"
                        disabled={bezig}
                        onClick={() => {
                          if (confirm("Test en alle gemeten cijfers verwijderen?")) actie(t.id, "delete");
                        }}
                      >
                        Verwijderen
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Banner tone="info">
          <strong>Starten verandert niets aan je producten.</strong> Beide blijven staan zoals ze
          zijn; alleen het thema gaat een deel van de bezoekers het duplicaat tonen. Stoppen zet
          dat direct terug.
        </Banner>
      </div>
    </main>
  );
}
