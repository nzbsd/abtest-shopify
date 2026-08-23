import { useFetcher } from "@remix-run/react";
import { useMemo, useState } from "react";
import { Banner, Card, Delta } from "~/components/ui";
import { geld } from "~/lib/analytics";
import { matchVariants, prijsVergelijking, type ProductInfo } from "~/lib/variants";
import { TYPES, normaliseerPad, type TestType } from "~/lib/testTypes";
import type { ThemaInfo, TemplateInfo } from "~/lib/themes.server";

/**
 * A small diagram per test type: control on the left, variant on the right.
 *
 * The four names alone do not say much — "page design" and "page versus page"
 * sound like the same thing until you see that one keeps the URL and the other
 * does not. A three-second glance at a picture settles that faster than the
 * paragraph underneath it.
 */
function TypeDiagram({ soort }: { soort: TestType }) {
  const blad = (x: number, gevuld: boolean) => (
    <rect x={x} y={4} width={18} height={24} rx={3}
          fill={gevuld ? "var(--iris-pale)" : "var(--wash)"}
          stroke={gevuld ? "var(--iris)" : "var(--line-loud)"} strokeWidth={1.2} />
  );
  return (
    <svg className="typekaart__fig" viewBox="0 0 52 32" aria-hidden="true">
      {blad(1, false)}
      {blad(33, true)}
      <path d="M22 16h8" stroke="var(--ink-3)" strokeWidth={1.2} strokeLinecap="round" />
      <path d="M27 13l3 3-3 3" fill="none" stroke="var(--ink-3)" strokeWidth={1.2}
            strokeLinecap="round" strokeLinejoin="round" />
      {soort === "price" && (
        <text x={42} y={20} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--iris)">$</text>
      )}
      {soort === "template" && (
        <>
          <rect x={36} y={8} width={12} height={5} rx={1.2} fill="var(--iris)" opacity={0.55} />
          <rect x={36} y={15} width={7} height={3} rx={1} fill="var(--iris)" opacity={0.35} />
          <rect x={36} y={20} width={12} height={3} rx={1} fill="var(--iris)" opacity={0.35} />
          <rect x={4} y={8} width={12} height={3} rx={1} fill="var(--ink-3)" opacity={0.3} />
          <rect x={4} y={13} width={12} height={9} rx={1.2} fill="var(--ink-3)" opacity={0.18} />
        </>
      )}
      {soort === "url" && (
        <>
          <rect x={4} y={24} width={8} height={2} rx={1} fill="var(--ink-3)" opacity={0.4} />
          <rect x={36} y={24} width={11} height={2} rx={1} fill="var(--iris)" opacity={0.6} />
        </>
      )}
      {soort === "theme" && (
        <>
          <rect x={30} y={2} width={18} height={24} rx={3} fill="var(--wash)" stroke="var(--line-loud)" strokeWidth={1} opacity={0.6} />
          <rect x={33} y={4} width={18} height={24} rx={3} fill="var(--iris-pale)" stroke="var(--iris)" strokeWidth={1.2} />
          <rect x={36} y={8} width={12} height={4} rx={1.2} fill="var(--iris)" opacity={0.5} />
          <rect x={36} y={14} width={12} height={9} rx={1.2} fill="var(--iris)" opacity={0.25} />
        </>
      )}
    </svg>
  );
}

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

/* ── template picker ─────────────────────────────────────────────────────── */

/**
 * The alternate product templates already in the theme.
 *
 * This used to be a text field. On this store the theme carries fourteen
 * alternate templates, so typing the suffix meant remembering one exactly —
 * and a typo does not fail loudly: Shopify falls back to the default template,
 * so the test group quietly sees the same page as the control group and the
 * test measures nothing while looking perfectly healthy.
 *
 * Typing is still allowed for a template that is not there yet, but it is the
 * exception rather than the default.
 */
function TemplateKiezer({
  templates, product, waarde, onKies, previewBasis,
}: {
  templates: TemplateInfo[];
  product: ProductInfo;
  waarde: string;
  onKies: (s: string) => void;
  previewBasis: string | null;
}) {
  const [handmatig, setHandmatig] = useState(false);

  // Wat de controlegroep vandaag ziet: het template waar het product op staat.
  // Leeg betekent het standaardtemplate, want dat is wat Shopify pakt als er
  // geen suffix is ingesteld.
  const huidig = product.templateSuffix || null;
  const huidigNaam = huidig ? "product." + huidig : "product (default)";

  // Het eigen template van het product valt af: dat kiezen zou een test
  // opleveren waarin beide groepen precies dezelfde pagina krijgen.
  const keuzes = templates.filter((t) => t.suffix !== huidig);

  const previewUrl = (suffix: string | null) =>
    !previewBasis ? null
      : suffix
        ? previewBasis + (previewBasis.includes("?") ? "&" : "?") + "view=" + encodeURIComponent(suffix)
        : previewBasis;

  return (
    <div className="field">
      <span className="field__label">Which page against which</span>

      <div className="duel">
        <div className="duel__kant">
          <span className="duel__kop"><span className="swatch swatch--control" /> Control</span>
          <span className="duel__naam">{huidigNaam}</span>
          <span className="duel__sub">
            {huidig ? "the template this product is set to" : "the default product template"}
          </span>
          {previewBasis && (
            <a className="btn btn--sm" target="_blank" rel="noreferrer" href={previewUrl(null)!}>
              Preview
            </a>
          )}
        </div>

        <span className="duel__vs">vs</span>

        <div className="duel__kant">
          <span className="duel__kop"><span className="swatch swatch--test" /> Test</span>
          {waarde ? (
            <>
              <span className="duel__naam">product.{waarde}</span>
              <span className="duel__sub">
                served as <code>?view={waarde}</code>
              </span>
              <span style={{ display: "flex", gap: 6 }}>
                {previewBasis && (
                  <a className="btn btn--sm btn--iris" target="_blank" rel="noreferrer"
                     href={previewUrl(waarde)!}>Preview</a>
                )}
                <button type="button" className="btn btn--sm" onClick={() => onKies("")}>Change</button>
              </span>
            </>
          ) : (
            <span className="duel__leeg">Pick a template below</span>
          )}
        </div>
      </div>

      {!waarde && (
        handmatig || !keuzes.length ? (
          <div style={{ maxWidth: 340, marginTop: 12 }}>
            <input type="text" placeholder="new-design"
                   onChange={(e) => onKies(e.target.value.trim())} />
            <span className="field__hint">
              The part after the dot in <code>product.new-design.json</code>.
              {keuzes.length > 0 && (
                <> <button type="button" className="linkje" onClick={() => setHandmatig(false)}>
                  Pick from the theme instead
                </button></>
              )}
            </span>
            {!templates.length && (
              <div style={{ marginTop: 10 }}>
                <Banner tone="warn">
                  Experli cannot read your theme's templates yet, so it cannot show the list.
                  Open the app from Shopify once to approve the <code>read_themes</code>{" "}
                  permission.
                </Banner>
              </div>
            )}
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            <div className="keuzeraster">
              {keuzes.map((t) => (
                <button key={t.suffix} type="button" className="keuze" aria-pressed={false}
                        onClick={() => onKies(t.suffix)}>
                  <span className="keuze__naam">{t.suffix}</span>
                  <span className="keuze__meta"><code>product.{t.suffix}.{t.soort}</code></span>
                </button>
              ))}
            </div>
            <span className="field__hint">
              {keuzes.length} other template{keuzes.length === 1 ? "" : "s"} in your live theme.
              {" "}
              <button type="button" className="linkje" onClick={() => setHandmatig(true)}>
                Enter one by hand
              </button>
              {" "}— to make a new one, duplicate a template in the theme editor and it appears here.
            </span>
          </div>
        )
      )}
    </div>
  );
}

/* ── theme picker ────────────────────────────────────────────────────────── */

function ThemaKiezer({
  themas, waarde, onKies, winkelUrl,
}: {
  themas: ThemaInfo[];
  waarde: ThemaInfo | null;
  onKies: (t: ThemaInfo | null) => void;
  winkelUrl: string | null;
}) {
  const live = themas.find((t) => t.rol === "MAIN") || null;
  const keuzes = themas.filter((t) => t.rol !== "MAIN");

  if (!themas.length) {
    return (
      <Banner tone="warn">
        No themes could be read. Experli needs the <code>read_themes</code> permission — open the
        app from Shopify once to approve it.
      </Banner>
    );
  }

  return (
    <>
      <div className="field">
        <span className="field__label">Control — your live theme</span>
        <div className="keuze keuze--vast">
          <span className="keuze__naam">{live?.naam ?? "(unknown)"}</span>
          <span className="keuze__meta">published · every visitor sees this today</span>
        </div>
      </div>

      <div className="field">
        <span className="field__label">Test group gets</span>
        <div className="keuzeraster">
          {keuzes.map((t) => {
            const aan = waarde?.id === t.id;
            return (
              <button key={t.id} type="button" className="keuze" aria-pressed={aan}
                      onClick={() => onKies(aan ? null : t)}>
                <span className="keuze__naam">{t.naam}</span>
                <span className="keuze__meta">
                  {/* Null means "could not check", which is not the same as
                      missing — no point alarming anyone about ignorance. */}
                  {t.snippet === false && <span className="pill pill--draft">no snippet</span>}
                  {t.snippet === true && <span className="pill pill--active">ready</span>}
                  {t.bijgewerkt && <span>edited {t.bijgewerkt.slice(0, 10)}</span>}
                </span>
              </button>
            );
          })}
        </div>
        {!keuzes.length && (
          <span className="field__hint">There are no unpublished themes to test against.</span>
        )}
      </div>

      {waarde && (
        <>
          {waarde.snippet === false && (
            <Banner tone="error">
              <strong>{waarde.naam}</strong> does not have the Experli snippet. The test group
              would browse it without ever being measured. Add the snippet to that theme first —
              Start is blocked until it is there.
            </Banner>
          )}
          {winkelUrl && (
            <div style={{ marginTop: 10 }}>
              <a className="btn btn--sm btn--iris" target="_blank" rel="noreferrer"
                 href={winkelUrl.replace(/\/+$/, "") + "/?preview_theme_id=" + waarde.num}>
                Preview {waarde.naam}
              </a>
            </div>
          )}
        </>
      )}
    </>
  );
}

/* ── wizard ──────────────────────────────────────────────────────────────── */

export function Wizard({
  producten, templates, themas, winkelUrl, onKlaar,
}: {
  producten: ProductInfo[];
  templates: TemplateInfo[];
  themas: ThemaInfo[];
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
  const [thema, setThema] = useState<ThemaInfo | null>(null);
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
    // De variant moet een ánder template zijn dan waar het product al op staat.
    : type === "template" ? Boolean(control && suffix.trim() && suffix.trim() !== control.templateSuffix)
    : type === "theme" ? Boolean(thema)
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
    if (type === "theme") { fd.set("themeId", thema!.id); fd.set("themeName", thema!.naam); }
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
                They all split visitors the same way and measure the same things. Only what the
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
                    <TypeDiagram soort={t.key} />
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
                            products={producten} picked={control}
                            onPick={(p) => {
                              setControl(p);
                              // Wissel je van product, dan kan de gekozen variant
                              // toevallig het eigen template van het nieuwe product
                              // zijn - en dan zouden beide groepen dezelfde pagina
                              // krijgen zonder dat het scherm dat laat merken.
                              if (p && suffix && p.templateSuffix === suffix) setSuffix("");
                            }} />
                  </div>
                  {control && (
                    <TemplateKiezer
                      templates={templates}
                      product={control}
                      waarde={suffix}
                      onKies={setSuffix}
                      previewBasis={
                        winkelUrl
                          ? winkelUrl.replace(/\/+$/, "") + "/products/" + control.handle
                          : control.url ?? null
                      }
                    />
                  )}
                </>
              )}

              {type === "theme" && (
                <div style={{ marginTop: 16 }}>
                  <ThemaKiezer themas={themas} waarde={thema} onKies={setThema} winkelUrl={winkelUrl} />
                </div>
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
                    {type === "url" ? <code>{normaliseerPad(controlUrl)}</code>
                      : type === "theme" ? <>{themas.find((t) => t.rol === "MAIN")?.naam ?? "live theme"} <span className="muted">— published</span></>
                      : <>{control?.title} <span className="muted">— unchanged</span></>}
                  </span>
                </div>
                <div className="review__rij">
                  <span className="review__label"><span className="swatch swatch--test" /> Test</span>
                  <span>
                    {type === "price" && <>{test?.title} <code>{test?.handle}</code></>}
                    {type === "template" && <>same product, <code>?view={suffix.trim()}</code></>}
                    {type === "url" && <code>{normaliseerPad(testUrl)}</code>}
                    {type === "theme" && <>{thema?.naam} <span className="muted">— every page</span></>}
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
