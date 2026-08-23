import { useFetcher } from "@remix-run/react";
import { useMemo, useState } from "react";
import { Banner, Card, Delta } from "~/components/ui";
import { geld } from "~/lib/analytics";
import { matchVariants, prijsVergelijking, type ProductInfo } from "~/lib/variants";
import { TYPES, normaliseerPad, type TestType } from "~/lib/testTypes";

/**
 * Setting up a test, as a sequence rather than a wall.
 *
 * The old form asked for everything at once, including fields that only apply
 * to one kind of test. Splitting it means each step asks one thing and can
 * explain itself, and the review step shows what will actually happen — which
 * is the moment to catch a mistake, not after live traffic has been split.
 */

type Stap = 0 | 1 | 2 | 3;

const STAPPEN = ["Type", "Setup", "Audience", "Review"];

function Voortgang({ stap, naar }: { stap: Stap; naar: (s: Stap) => void }) {
  return (
    <ol className="wizard__steps">
      {STAPPEN.map((label, i) => {
        const staat = i < stap ? "gedaan" : i === stap ? "nu" : "later";
        return (
          <li key={label} className={"wizard__step wizard__step--" + staat}>
            <button
              type="button"
              /* Only backwards: forwards would skip validation and land you on
                 a review of something half configured. */
              onClick={() => i < stap && naar(i as Stap)}
              disabled={i >= stap}
            >
              <span className="wizard__bol">{i < stap ? "✓" : i + 1}</span>
              {label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/* ── product picker (compact) ────────────────────────────────────────────── */

function Kiezer({
  label, hint, products, picked, onPick, exclude,
}: {
  label: string;
  hint: string;
  products: ProductInfo[];
  picked: ProductInfo | null;
  onPick: (p: ProductInfo | null) => void;
  exclude?: string | null;
}) {
  const [q, setQ] = useState("");

  const zichtbaar = useMemo(() => {
    const n = q.trim().toLowerCase();
    return products
      .filter((p) => p.id !== exclude)
      .filter((p) => !n || p.title.toLowerCase().includes(n) || p.handle.includes(n))
      .slice(0, 30);
  }, [products, q, exclude]);

  const rij = (p: ProductInfo, gekozen: boolean) => {
    const laagste = Math.min(...p.variants.map((v) => parseFloat(v.price) || 0));
    return (
      <>
        {p.image ? <img className="picker__img" src={p.image} alt="" /> : <span className="picker__img" />}
        <span className="picker__body">
          <span className="picker__title" title={p.title}>{p.title}</span>
          <span className="picker__meta">
            {p.status && <span className={"pill pill--" + p.status.toLowerCase()}>{p.status.toLowerCase()}</span>}
            <code>{p.handle}</code>
            <span className="num">from {geld(laagste)}</span>
          </span>
        </span>
        {gekozen && (
          <span style={{ display: "flex", gap: 6, flex: "none" }}>
            {p.url && <a className="btn btn--sm" href={p.url} target="_blank" rel="noreferrer">Preview</a>}
            <button type="button" className="btn btn--sm" onClick={() => onPick(null)}>Change</button>
          </span>
        )}
      </>
    );
  };

  if (picked) {
    return (
      <div className="field">
        <span className="field__label">{label}</span>
        <div className="picker__item" aria-pressed="true" style={{ cursor: "default" }}>
          {rij(picked, true)}
        </div>
      </div>
    );
  }

  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <input type="search" placeholder="Search by name or handle" value={q}
             onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 8 }} />
      <div className="picker">
        {!zichtbaar.length && <p className="small muted" style={{ padding: 8 }}>No products found.</p>}
        {zichtbaar.map((p) => (
          <div className="picker__row" key={p.id}>
            <button type="button" className="picker__item" onClick={() => onPick(p)}>{rij(p, false)}</button>
            {p.url && <a className="btn btn--sm" href={p.url} target="_blank" rel="noreferrer">Preview</a>}
          </div>
        ))}
      </div>
      <span className="field__hint">{hint}</span>
    </div>
  );
}

/* ── wizard ──────────────────────────────────────────────────────────────── */

export function Wizard({
  producten, winkelUrl, onKlaar,
}: {
  producten: ProductInfo[];
  winkelUrl: string | null;
  onKlaar: () => void;
}) {
  const fetcher = useFetcher<{ ok: boolean; bericht: string }>();
  const bezig = fetcher.state !== "idle";

  const [stap, setStap] = useState<Stap>(0);
  const [type, setType] = useState<TestType>("price");

  const [naam, setNaam] = useState("");
  const [hypothese, setHypothese] = useState("");
  const [control, setControl] = useState<ProductInfo | null>(null);
  const [test, setTest] = useState<ProductInfo | null>(null);
  const [suffix, setSuffix] = useState("");
  const [controlUrl, setControlUrl] = useState("");
  const [testUrl, setTestUrl] = useState("");
  const [split, setSplit] = useState("50");
  const [abo, setAbo] = useState(false);
  const [cycles, setCycles] = useState("1.8");

  const info = TYPES.find((t) => t.key === type)!;

  const koppeling = type === "price" && control && test ? matchVariants(control, test) : null;
  const vergelijking = type === "price" && control && test && koppeling
    ? prijsVergelijking(control, test, koppeling.pairs)
    : [];
  const zelfdePrijs = vergelijking.length > 0 && vergelijking.every((v) => Math.abs(v.verschil) < 0.005);

  const setupKlaar =
    type === "price" ? Boolean(control && test && koppeling?.pairs.length)
    : type === "template" ? Boolean(control && suffix.trim())
    : Boolean(controlUrl.trim() && testUrl.trim() &&
              normaliseerPad(controlUrl) !== normaliseerPad(testUrl));

  const bewaar = () => {
    const fd = new FormData();
    fd.set("intent", "save");
    fd.set("testType", type);
    fd.set("naam", naam);
    fd.set("hypothese", hypothese);
    fd.set("split", split);
    fd.set("isSubscription", abo ? "1" : "");
    fd.set("cycles", cycles);
    if (type === "price") { fd.set("control", control!.id); fd.set("test", test!.id); }
    if (type === "template") { fd.set("control", control!.id); fd.set("templateSuffix", suffix.trim()); }
    if (type === "url") { fd.set("controlUrl", controlUrl); fd.set("testUrl", testUrl); }
    fetcher.submit(fd, { method: "post" });
    onKlaar();
  };

  return (
    <Card>
      <div className="wizard">
        <Voortgang stap={stap} naar={setStap} />

        <div className="wizard__paneel">
          {/* ── 1. type ─────────────────────────────────────────────────── */}
          {stap === 0 && (
            <div className="tabinhoud">
              <h3 className="wizard__kop">What do you want to test?</h3>
              <p className="wizard__sub">
                All three split visitors the same way and measure the same things. Only what the
                test group is shown differs.
              </p>

              <div className="typekaarten">
                {TYPES.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    className="typekaart"
                    aria-pressed={type === t.key}
                    onClick={() => setType(t.key)}
                  >
                    <span className="typekaart__naam">{t.naam}</span>
                    <span className="typekaart__kort">{t.kort}</span>
                    <span className="typekaart__uitleg">{t.uitleg}</span>
                    <span className="typekaart__mech">{t.mechaniek}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── 2. setup ────────────────────────────────────────────────── */}
          {stap === 1 && (
            <div className="tabinhoud">
              <h3 className="wizard__kop">{info.naam} test</h3>
              <p className="wizard__sub">{info.voorbereiding}</p>

              {type === "price" && (
                <>
                  <div className="row" style={{ marginTop: 16 }}>
                    <Kiezer label="Original — control group"
                            hint="The product visitors land on now."
                            products={producten} picked={control} onPick={setControl}
                            exclude={test?.id} />
                    <Kiezer label="Duplicate — test group"
                            hint="Same product, the price you want to test."
                            products={producten} picked={test} onPick={setTest}
                            exclude={control?.id} />
                  </div>

                  {koppeling && (
                    <div style={{ marginTop: 18 }}>
                      {zelfdePrijs && (
                        <div style={{ marginBottom: 10 }}>
                          <Banner tone="warn">
                            Both products have the same price — there is nothing to measure yet.
                          </Banner>
                        </div>
                      )}
                      {koppeling.unmatched.length > 0 && (
                        <div style={{ marginBottom: 10 }}>
                          <Banner tone="error">
                            <strong>Not matched:</strong> {koppeling.unmatched.join(", ")}. Those
                            variants fall outside the test.
                          </Banner>
                        </div>
                      )}
                      <div className="table-scroll card" style={{ boxShadow: "none", border: "1px solid var(--line)" }}>
                        <table>
                          <thead><tr><th>Variant</th><th>Now</th><th>Test</th><th>Difference</th></tr></thead>
                          <tbody>
                            {vergelijking.map((v) => (
                              <tr key={v.titel}>
                                <td>{v.titel}</td>
                                <td className="num">{geld(v.oud)}</td>
                                <td className="num"><strong>{geld(v.nieuw)}</strong></td>
                                <td>{Math.abs(v.verschil) < 0.005
                                  ? <span className="muted">same</span>
                                  : <Delta waarde={v.procent} goedAls="geen" />}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}

              {type === "template" && (
                <>
                  <div style={{ marginTop: 16 }}>
                    <Kiezer label="Product" hint="Both groups buy this, at the same price."
                            products={producten} picked={control} onPick={setControl} />
                  </div>
                  <div className="field" style={{ maxWidth: 340 }}>
                    <span className="field__label">Template suffix</span>
                    <input type="text" value={suffix} placeholder="new-design"
                           onChange={(e) => setSuffix(e.target.value)} />
                    <span className="field__hint">
                      The part after the dot in <code>product.new-design.liquid</code>. The test
                      group gets <code>?view={suffix.trim() || "…"}</code> on the same URL.
                    </span>
                  </div>
                  {control && suffix.trim() && winkelUrl && (
                    <a className="btn btn--sm" target="_blank" rel="noreferrer"
                       href={winkelUrl.replace(/\/+$/, "") + "/products/" + control.handle + "?view=" + suffix.trim()}>
                      Preview the variant
                    </a>
                  )}
                </>
              )}

              {type === "url" && (
                <div className="row" style={{ marginTop: 16 }}>
                  <div className="field">
                    <span className="field__label">Original page</span>
                    <input type="text" value={controlUrl} placeholder="/pages/offer"
                           onChange={(e) => setControlUrl(e.target.value)} />
                    <span className="field__hint">Path or full URL — both work.</span>
                  </div>
                  <div className="field">
                    <span className="field__label">Variant page</span>
                    <input type="text" value={testUrl} placeholder="/pages/offer-v2"
                           onChange={(e) => setTestUrl(e.target.value)} />
                    <span className="field__hint">Where the test group is sent instead.</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── 3. audience ─────────────────────────────────────────────── */}
          {stap === 2 && (
            <div className="tabinhoud">
              <h3 className="wizard__kop">Who sees it, and what is it worth</h3>
              <p className="wizard__sub">
                A name helps once several tests run on the same product. The hypothesis is for
                your future self, who will not remember why this seemed like a good idea.
              </p>

              <div className="row" style={{ marginTop: 16 }}>
                <div className="field">
                  <span className="field__label">Name</span>
                  <input type="text" value={naam} placeholder="Oregano +$4"
                         onChange={(e) => setNaam(e.target.value)} />
                </div>
                <div className="field">
                  <span className="field__label">Percentage in the test group</span>
                  <input type="number" min={1} max={99} value={split}
                         onChange={(e) => setSplit(e.target.value)} />
                  <span className="field__hint">50 is almost always best — it gets you an answer soonest.</span>
                </div>
              </div>

              <div className="field">
                <span className="field__label">Hypothesis</span>
                <input type="text" value={hypothese}
                       placeholder="A higher price costs some conversion but earns more per visitor"
                       onChange={(e) => setHypothese(e.target.value)} />
              </div>

              <div className="card" style={{ boxShadow: "none", border: "1px solid var(--line)", padding: 14, marginTop: 6 }}>
                <label style={{ display: "flex", gap: 9, alignItems: "flex-start", cursor: "pointer" }}>
                  <input type="checkbox" checked={abo} onChange={(e) => setAbo(e.target.checked)}
                         style={{ width: 15, height: 15, marginTop: 2, flex: "none" }} />
                  <span>
                    <strong style={{ fontSize: 13 }}>This is a subscription product</strong>
                    <span className="field__hint" style={{ display: "block", marginTop: 2 }}>
                      Adds a Forecast tab that projects the difference over a customer lifetime,
                      and works out how much retention the variant could afford to lose.
                    </span>
                  </span>
                </label>

                {abo && (
                  <div className="field" style={{ maxWidth: 280, marginTop: 12, marginBottom: 0 }}>
                    <span className="field__label">Average billing cycles per customer</span>
                    <input type="number" step="0.1" min={1} max={60} value={cycles}
                           onChange={(e) => setCycles(e.target.value)} />
                    <span className="field__hint">Including the first order. Your assumption, not a measurement.</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── 4. review ───────────────────────────────────────────────── */}
          {stap === 3 && (
            <div className="tabinhoud">
              <h3 className="wizard__kop">What will happen</h3>
              <p className="wizard__sub">
                Read this as a visitor would. It is the last cheap moment to spot a mistake.
              </p>

              <div className="review">
                <div className="review__rij">
                  <span className="review__label">Test</span>
                  <span>{naam.trim() || <span className="muted">unnamed</span>} · {info.naam}</span>
                </div>
                <div className="review__rij">
                  <span className="review__label"><span className="swatch swatch--control" /> Control</span>
                  <span>
                    {type === "url"
                      ? <code>{normaliseerPad(controlUrl)}</code>
                      : <>{control?.title} <span className="muted">— unchanged</span></>}
                  </span>
                </div>
                <div className="review__rij">
                  <span className="review__label"><span className="swatch swatch--test" /> Test</span>
                  <span>
                    {type === "price" && <>{test?.title} <code>{test?.handle}</code></>}
                    {type === "template" && <>same product, <code>?view={suffix.trim()}</code></>}
                    {type === "url" && <code>{normaliseerPad(testUrl)}</code>}
                  </span>
                </div>
                <div className="review__rij">
                  <span className="review__label">Split</span>
                  <span>{split}% test · {100 - Number(split || 0)}% control</span>
                </div>
                {abo && (
                  <div className="review__rij">
                    <span className="review__label">Lifetime</span>
                    <span>{cycles} billing cycles assumed</span>
                  </div>
                )}
                {hypothese.trim() && (
                  <div className="review__rij">
                    <span className="review__label">Hypothesis</span>
                    <span className="muted">{hypothese}</span>
                  </div>
                )}
              </div>

              <div style={{ marginTop: 14 }}>
                <Banner tone="info">
                  Saving does not start anything. The test sits as a draft until you press Start,
                  and only then does it get checked and begin splitting traffic.
                </Banner>
              </div>
            </div>
          )}
        </div>

        {/* ── navigatie ─────────────────────────────────────────────────── */}
        <div className="wizard__voet">
          <button className="btn" onClick={() => (stap === 0 ? onKlaar() : setStap((stap - 1) as Stap))}>
            {stap === 0 ? "Cancel" : "Back"}
          </button>
          <span style={{ flex: 1 }} />
          {stap < 3 ? (
            <button
              className="btn btn--iris"
              disabled={stap === 1 && !setupKlaar}
              onClick={() => setStap((stap + 1) as Stap)}
            >
              Continue
            </button>
          ) : (
            <button className="btn btn--iris" onClick={bewaar} disabled={bezig}>
              {bezig ? "Saving…" : "Save as draft"}
            </button>
          )}
        </div>
      </div>
    </Card>
  );
}
