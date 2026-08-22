import { Link, useFetcher } from "@remix-run/react";
import { useMemo, useState } from "react";
import { PageHead } from "~/components/shell";
import { Badge, Banner, Card, CardHead, Delta, Leeg } from "~/components/ui";
import { geld, heel, looptDagen } from "~/lib/analytics";
import { matchVariants, prijsVergelijking, type ProductInfo } from "~/lib/variants";
import type { PriceTest } from "~/lib/priceTest.server";

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
        <span className="picker__title">{p.title}</span>
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
        style={{ marginBottom: 10 }}
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

/* ── screen ─────────────────────────────────────────────────────────────── */

export function TestsView({
  tests, producten, fout, winkelUrl, basis,
}: {
  tests: PriceTest[];
  producten: ProductInfo[];
  fout: string | null;
  /** Public storefront URL, for preview links from a saved test. */
  winkelUrl: string | null;
  /** "/dashboard" or "/app" - where the results link points. */
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
    fetcher.submit(fd, { method: "post" });
    setOpen(false);
    setControl(null);
    setTest(null);
  };

  const act = (id: number, intent: "start" | "stop" | "delete") => {
    const fd = new FormData();
    fd.set("intent", intent);
    fd.set("id", String(id));
    fetcher.submit(fd, { method: "post" });
  };

  return (
    <main className="page">
      <PageHead
        titel="Tests"
        sub="Which product runs against which duplicate, and how traffic is split."
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
            <div style={{ marginTop: 6 }}><code>{fout}</code></div>
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
          <Card>
            <CardHead
              title="New test"
              sub="The original is the control group, the duplicate is the test group."
            />
            <div className="card__body">
              <Banner tone="warn">
                First duplicate the product in Shopify and set the new price on it — per market if
                you want. Attach your <strong>bundle, selling plan and reviews</strong> to it as
                well; miss one and you will be measuring that difference instead of the price.
                Keep the duplicate <strong>unlisted</strong> so it stays out of search and
                collections.
              </Banner>

              <div className="row" style={{ marginTop: 20 }}>
                <Picker
                  label="Original — control group"
                  hint="The product visitors currently land on."
                  products={producten}
                  picked={control}
                  onPick={setControl}
                  exclude={test?.id}
                />
                <Picker
                  label="Duplicate — test group"
                  hint="The same product at the price you want to test."
                  products={producten}
                  picked={test}
                  onPick={setTest}
                  exclude={control?.id}
                />
              </div>

              {matched && (
                <div style={{ marginTop: 24 }}>
                  <span className="field__label">What gets matched</span>

                  {samePrice && (
                    <div style={{ marginBottom: 12 }}>
                      <Banner tone="warn">
                        Both products have the same price. There is nothing to measure — set the
                        new price on the duplicate first.
                      </Banner>
                    </div>
                  )}

                  {matched.unmatched.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <Banner tone="error">
                        <strong>Not matched:</strong> {matched.unmatched.join(", ")}. Those variants
                        fall outside the test and keep their own price.
                      </Banner>
                    </div>
                  )}

                  <div className="table-scroll card" style={{ boxShadow: "none", border: "1px solid var(--line)" }}>
                    <table>
                      <thead>
                        <tr><th>Variant</th><th>Now</th><th>Test</th><th>Difference</th></tr>
                      </thead>
                      <tbody>
                        {comparison.map((v) => (
                          <tr key={v.titel}>
                            <td>{v.titel}</td>
                            <td className="num">{geld(v.oud)}</td>
                            <td className="num"><strong>{geld(v.nieuw)}</strong></td>
                            <td>
                              {Math.abs(v.verschil) < 0.005
                                ? <span className="muted">same</span>
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
                <span className="field__label">Percentage in the test group</span>
                <input type="number" min={1} max={99} value={split}
                       onChange={(e) => setSplit(e.target.value)} />
                <span className="field__hint">The rest is the control group. 50 is almost always best.</span>
              </div>

              <div style={{ marginTop: 22, display: "flex", gap: 10 }}>
                <button className="btn btn--iris" onClick={save}
                        disabled={!control || !test || !matched?.pairs.length || busy}>
                  {busy ? "Working…" : "Save test"}
                </button>
                <button className="btn" onClick={() => setOpen(false)}>Cancel</button>
              </div>
            </div>
          </Card>
        )}

        <Card>
          <CardHead title="All tests" />
          <div className="card__body card__body--flush">
            {!tests.length && <Leeg>No tests yet.</Leeg>}
            {tests.map((t) => {
              const days = looptDagen(t.started_at);
              return (
                <div className="test-row" key={t.id}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <strong>{t.control_title || t.control_product_id}</strong>
                      <Badge status={t.status} />
                    </div>
                    <div className="pair">
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
                    </div>
                    <p className="small muted" style={{ marginTop: 6 }}>
                      {t.split_pct}% in the test group · {heel((t.variant_map || []).length)} variant(s) matched
                      {days !== null && t.status === "running" ? " · running for " + days + " days" : ""}
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Link className="btn" to={basis + "/analytics?test=" + t.id}>Results</Link>
                    {t.status === "running" ? (
                      <button className="btn btn--danger" disabled={busy} onClick={() => act(t.id, "stop")}>
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
          <strong>Starting changes nothing about your products.</strong> Both stay exactly as they
          are; the theme simply sends part of the traffic to the duplicate's URL instead. Stopping
          reverses that immediately.
        </Banner>
      </div>
    </main>
  );
}
