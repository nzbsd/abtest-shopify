import { Link, useFetcher } from "@remix-run/react";
import { useMemo, useState } from "react";
import { PageHead } from "~/components/shell";
import { Badge, Banner, Card, CardHead, Delta, Leeg } from "~/components/ui";
import { SparkPaar } from "~/components/charts";
import { geld, heel, looptDagen, type DagRij } from "~/lib/analytics";
import { matchVariants, prijsVergelijking, type ProductInfo } from "~/lib/variants";
import type { PriceTest } from "~/lib/priceTest.server";
import { typeInfo, watOntbreekt } from "~/lib/testTypes";
import { Wizard } from "./wizard";
import { BesluitModal, besluitNaam } from "./besluit";
import type { ThemaInfo, TemplateInfo } from "~/lib/themes.server";

/* ── product picker ─────────────────────────────────────────────────────── */

/**
 * Status pill.
 *
 * Worth showing: this store has several products sharing a title, and the
 * status is often the only thing that tells them apart. Unlisted is also
 * exactly what a duplicate should be — reachable by URL, invisible in search
 * and collections — so seeing it here is a check, not just a label.
 */
function StatusPill({ status }: { status?: string }) {
  if (!status) return null;
  const s = status.toLowerCase();
  return <span className={"pill pill--" + s}>{s}</span>;
}

function ProductRow({
  p, onPick, picked,
}: {
  p: ProductInfo;
  onPick?: () => void;
  picked?: boolean;
}) {
  const lowest = Math.min(...p.variants.map((v) => parseFloat(v.price) || 0));

  const body = (
    <>
      {p.image ? <img className="picker__img" src={p.image} alt="" /> : <span className="picker__img" />}
      <span className="picker__body">
        <span className="picker__title" title={p.title}>{p.title}</span>
        <span className="picker__meta">
          <StatusPill status={p.status} />
          <code>{p.handle}</code>
          <span className="num">
            {p.variants.length} variant{p.variants.length === 1 ? "" : "s"} · from {geld(lowest)}
          </span>
        </span>
      </span>
    </>
  );

  if (picked) {
    return (
      <div className="picker__item" aria-pressed="true" style={{ cursor: "default" }}>
        {body}
        <span style={{ display: "flex", gap: 8, flex: "none" }}>
          {p.url && (
            <a className="btn btn--sm" href={p.url} target="_blank" rel="noreferrer">
              Preview
            </a>
          )}
          <button type="button" className="btn btn--sm" onClick={onPick}>Change</button>
        </span>
      </div>
    );
  }

  // The preview link sits beside the choose button rather than inside it:
  // a link nested in a button is invalid markup and makes the whole row
  // unpredictable to click.
  return (
    <div className="picker__row">
      <button type="button" className="picker__item" onClick={onPick}>
        {body}
      </button>
      {p.url && (
        <a className="btn btn--sm" href={p.url} target="_blank" rel="noreferrer">
          Preview
        </a>
      )}
    </div>
  );
}

function Picker({
  label, hint, products, picked, onPick, exclude,
}: {
  label: string;
  hint: string;
  products: ProductInfo[];
  picked: ProductInfo | null;
  onPick: (p: ProductInfo | null) => void;
  exclude?: string;
}) {
  const [q, setQ] = useState("");

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return products
      .filter((p) => p.id !== exclude)
      .filter((p) => !needle || p.title.toLowerCase().includes(needle) || p.handle.includes(needle))
      .slice(0, 40);
  }, [products, q, exclude]);

  if (picked) {
    return (
      <div className="field">
        <span className="field__label">{label}</span>
        <ProductRow p={picked} picked onPick={() => onPick(null)} />
      </div>
    );
  }

  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <input
        type="search"
        placeholder="Search by name or handle"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ marginBottom: 12 }}
      />
      <div className="picker">
        {!visible.length && <p className="small muted" style={{ padding: 8 }}>No products found.</p>}
        {visible.map((p) => (
          <ProductRow key={p.id} p={p} onPick={() => onPick(p)} />
        ))}
      </div>
      <span className="field__hint">{hint}</span>
    </div>
  );
}

/**
 * Lifetime settings on an existing test.
 *
 * Editable while running: it only changes how the numbers are read, never what
 * visitors see. Making people recreate a test to change an assumption would
 * throw away the data they already collected.
 */
function LtvInstelling({
  t, onSave, busy,
}: {
  t: PriceTest;
  onSave: (id: number, aan: boolean, cycles: string) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [aan, setAan] = useState(Boolean(t.is_subscription));
  const [cycles, setCycles] = useState(String(t.avg_cycles ?? 1.8));

  if (!open) {
    return (
      <button className="btn btn--sm" onClick={() => setOpen(true)}>
        {t.is_subscription ? "Lifetime: " + Number(t.avg_cycles ?? 0).toFixed(1) + " cycles" : "Set lifetime"}
      </button>
    );
  }

  return (
    <div className="veldkaart" style={{ width: "100%", marginTop: 12 }}>
      <label className="schakelrij" style={{ border: 0, padding: 0 }}>
        <input type="checkbox" checked={aan} onChange={(e) => setAan(e.target.checked)} />
        <span className="schakelrij__body">
          <span className="schakelrij__naam">Subscription product</span>
          <span className="schakelrij__sub">
            Turns on the Forecast tab, which projects the difference over a customer lifetime.
          </span>
        </span>
      </label>

      {aan && (
        <div className="field" style={{ maxWidth: 300, marginTop: 16, marginBottom: 0 }}>
          <span className="field__label">Average billing cycles per customer</span>
          <input type="number" step="0.1" min={1} max={60} value={cycles}
                 onChange={(e) => setCycles(e.target.value)} />
          <span className="field__hint">Including the first order. Your assumption, not a measurement.</span>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <button className="btn btn--iris btn--sm" disabled={busy}
                onClick={() => { onSave(t.id, aan, cycles); setOpen(false); }}>Save</button>
        <button className="btn btn--sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

/* ── screen ─────────────────────────────────────────────────────────────── */

/**
 * De dagreeks van een test, per arm, voor het lijntje in de lijst.
 *
 * Bezoekers en niet omzet: deze pagina gaat over de opzet, en de vraag die
 * een lijntje hier beantwoordt is "meet deze test uberhaupt nog" - niet "wie
 * wint". Daarvoor is bezoekersverkeer het directe signaal; omzet loopt achter
 * en kan een dag nul zijn zonder dat er iets mis is.
 */
function reeksVoor(daily: DagRij[], testId: number): { control: number[]; test: number[] } {
  const eigen = daily.filter((r) => Number(r.test_id) === testId);
  const dagen = [...new Set(eigen.map((r) => String(r.dag)))].sort().slice(-14);
  const pak = (cohort: string) =>
    dagen.map((d) => {
      const rij = eigen.find((r) => String(r.dag) === d && r.cohort === cohort);
      return Number(rij?.visitors ?? 0);
    });
  return { control: pak("control"), test: pak("test") };
}

export function TestsView({
  tests, producten, templates, themas, fout, winkelUrl, shop, basis, daily = [],
}: {
  tests: PriceTest[];
  /** Bezoekers en orders per dag, voor het lijntje op elke lopende rij. */
  daily?: DagRij[];
  producten: ProductInfo[];
  templates: TemplateInfo[];
  themas: ThemaInfo[];
  fout: string | null;
  /** Winkeldomein, voor de deeplink naar de theme editor. */
  shop: string | null;
  /** Public storefront URL, for preview links from a saved test. */
  winkelUrl: string | null;
  /** Where the results link points. */
  basis: string;
}) {
  const productUrl = (handle: string | null | undefined) =>
    winkelUrl && handle ? winkelUrl.replace(/\/+$/, "") + "/products/" + handle : null;
  const fetcher = useFetcher<{ ok: boolean; bericht: string }>();
  const busy = fetcher.state !== "idle";

  const [open, setOpen] = useState(false);
  const [control, setControl] = useState<ProductInfo | null>(null);
  const [test, setTest] = useState<ProductInfo | null>(null);
  const [split, setSplit] = useState("50");
  const [abo, setAbo] = useState(false);
  const [cycles, setCycles] = useState("1.8");

  // Matching and price comparison computed live with the exact same function
  // the server will use, so what you see is what gets saved.
  const matched = control && test ? matchVariants(control, test) : null;
  const comparison = control && test && matched
    ? prijsVergelijking(control, test, matched.pairs)
    : [];

  const samePrice = comparison.length > 0 && comparison.every((v) => Math.abs(v.verschil) < 0.005);

  const save = () => {
    if (!control || !test) return;
    const fd = new FormData();
    fd.set("intent", "save");
    fd.set("control", control.id);
    fd.set("test", test.id);
    fd.set("split", split);
    fd.set("isSubscription", abo ? "1" : "");
    fd.set("cycles", cycles);
    fetcher.submit(fd, { method: "post" });
    setOpen(false);
    setControl(null);
    setTest(null);
  };

  const bewaarLtv = (id: number, aan: boolean, cycles: string) => {
    const fd = new FormData();
    fd.set("intent", "settings");
    fd.set("id", String(id));
    fd.set("isSubscription", aan ? "1" : "");
    fd.set("cycles", cycles);
    fetcher.submit(fd, { method: "post" });
  };

  // Welke test op het punt staat gestopt te worden, zodat de vraag naar het
  // besluit op dat moment komt en niet als los veld achteraf.
  const [stopt, setStopt] = useState<PriceTest | null>(null);

  const act = (id: number, intent: "start" | "stop" | "delete", extra?: Record<string, string>) => {
    const fd = new FormData();
    fd.set("intent", intent);
    fd.set("id", String(id));
    for (const [k, v] of Object.entries(extra ?? {})) fd.set(k, v);
    fetcher.submit(fd, { method: "post" });
  };

  return (
    <main className="page">
      <PageHead
        titel="Tests"
        sub="What is being compared with what, and how the traffic is divided."
        actie={
          <button className={"btn " + (open ? "" : "btn--iris")} onClick={() => setOpen((v) => !v)}>
            {open ? "Cancel" : "New test"}
          </button>
        }
      />

      <div className="stack">
        {fout && (
          <Banner tone="error">
            <strong>Configuration incomplete.</strong>
            <div style={{ marginTop: 8 }}><code>{fout}</code></div>
          </Banner>
        )}

        {/* pre-line: the pre-flight message lists its findings on separate
            lines, and collapsing them into one paragraph makes it unreadable. */}
        {fetcher.data?.bericht && (
          <Banner tone={fetcher.data.ok ? "ok" : "error"}>
            <span style={{ whiteSpace: "pre-line" }}>{fetcher.data.bericht}</span>
          </Banner>
        )}

        {open && (
          <Wizard
            producten={producten}
            templates={templates}
            themas={themas}
            winkelUrl={winkelUrl}
            shop={shop}
            onKlaar={() => setOpen(false)}
          />
        )}

        <Card>
          <CardHead title="All tests" sub="Newest first. A draft changes nothing until you start it." />
          <div className="card__body card__body--flush">
            {!tests.length && <Leeg>No tests yet.</Leeg>}
            {tests.map((t) => {
              const days = looptDagen(t.started_at);
              return (
                <div className={"test-row test-row--" + t.test_type + (t.status === "running" ? " test-row--loopt" : "")} key={t.id}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                      <strong>{t.naam || t.control_title || t.control_product_id}</strong>
                      <span className={"typepil typepil--" + t.test_type}>{typeInfo(t.test_type).naam}</span>
                      <Badge status={t.status} />
                    </div>
                    <div className="pair">
                      {t.test_type === "url" ? (
                        <>
                          <span className="legend__item"><span className="swatch swatch--control" /><code>{t.control_url}</code></span>
                          <span className="pair__arrow">→</span>
                          <span className="legend__item"><span className="swatch swatch--test" /><code>{t.test_url}</code></span>
                        </>
                      ) : t.test_type === "template" ? (
                        <>
                          <span className="legend__item"><span className="swatch swatch--control" />default template</span>
                          <span className="pair__arrow">→</span>
                          <span className="legend__item"><span className="swatch swatch--test" /><code>?view={t.template_suffix}</code></span>
                        </>
                      ) : (
                        <>
                          <span className="legend__item">
                            <span className="swatch swatch--control" />
                            {productUrl(t.control_product_handle) ? (
                              <a href={productUrl(t.control_product_handle)!} target="_blank" rel="noreferrer">
                                <code>{t.control_product_handle}</code>
                              </a>
                            ) : <code>original</code>}
                          </span>
                          <span className="pair__arrow">→</span>
                          <span className="legend__item">
                            <span className="swatch swatch--test" />
                            {productUrl(t.test_product_handle) ? (
                              <a href={productUrl(t.test_product_handle)!} target="_blank" rel="noreferrer">
                                <code>{t.test_product_handle}</code>
                              </a>
                            ) : <code>{t.test_product_handle}</code>}
                          </span>
                        </>
                      )}
                    </div>
                    {watOntbreekt(t) && (
                      <p className="small" style={{ marginTop: 8, color: "var(--down)" }}>
                        {watOntbreekt(t)}
                      </p>
                    )}
                    {/* Een besluit dat je vastlegt maar nergens terugziet is
                        een formulier, geen logboek. */}
                    {t.besluit && (
                      <p className="besluitregel">
                        <span className="besluitregel__label">{besluitNaam(t.besluit)}</span>
                        {t.besluit_notitie && <span>{t.besluit_notitie}</span>}
                        {t.besluit_at && (
                          <span className="muted">{String(t.besluit_at).slice(0, 10)}</span>
                        )}
                      </p>
                    )}
                    <p className="small muted" style={{ marginTop: 8 }}>
                      {t.split_pct}% in the test group · {heel((t.variant_map || []).length)} variant(s) matched
                      {days !== null && t.status === "running" ? " · running for " + days + " days" : ""}
                    </p>

                    {/* Alleen bij een lopende test, en alleen als er echt een
                        verloop is. Deze pagina gaat over wat er ingesteld staat,
                        niet over de uitslag - maar of een test überhaupt aan het
                        meten is, wil je hier wel zien zonder door te klikken.
                        Twee vlakke lijnen zijn dan het duidelijkste signaal dat
                        er iets stilstaat. */}
                    {t.status === "running" && (() => {
                      const reeks = reeksVoor(daily, t.id);
                      if (reeks.control.length < 4) return null;
                      return (
                        <div className="test-row__spark">
                          <SparkPaar
                            control={reeks.control}
                            test={reeks.test}
                            hoogte={40}
                            label={"Daily visitors for " + (t.naam || "this test") +
                                   ", control against test"}
                          />
                        </div>
                      );
                    })()}
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <LtvInstelling t={t} onSave={bewaarLtv} busy={busy} />
                    <Link className="btn" to={basis + "/analytics?test=" + t.id}>Results</Link>
                    {t.status === "running" ? (
                      <button className="btn btn--danger" disabled={busy} onClick={() => setStopt(t)}>
                        Stop
                      </button>
                    ) : (
                      <button className="btn btn--iris" disabled={busy} onClick={() => act(t.id, "start")}>
                        Start
                      </button>
                    )}
                    {t.status !== "running" && (
                      <button
                        className="btn"
                        disabled={busy}
                        onClick={() => {
                          if (confirm("Delete this test and everything measured for it?")) act(t.id, "delete");
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Banner tone="info">
          <strong>Starting changes nothing about your products or pages.</strong> Everything stays
          exactly as it is; the theme simply sends part of the traffic to the other version.
          Stopping reverses that immediately.
        </Banner>
      </div>

      {stopt && (
        <BesluitModal
          test={stopt}
          bezig={busy}
          onSluit={() => setStopt(null)}
          onStop={(besluit, notitie) => {
            act(stopt.id, "stop", { besluit, besluitNotitie: notitie });
            setStopt(null);
          }}
        />
      )}
    </main>
  );
}
