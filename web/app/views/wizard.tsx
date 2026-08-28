import { useFetcher } from "@remix-run/react";
import type { VerzendMethode } from "~/lib/verzending.server";
import { useEffect, useMemo, useState } from "react";
import { Banner, Card, Delta, Modal, Segmented } from "~/components/ui";
import { geld } from "~/lib/analytics";
import { matchVariants, prijsVergelijking, type ProductInfo } from "~/lib/variants";
import { TYPES, normaliseerPad, type TestType } from "~/lib/testTypes";
import type { ThemaInfo, TemplateInfo } from "~/lib/themes.server";
import { METRICS, metricInfo, type MetricKey } from "~/lib/metrics";
import { benodigdVoorVerhouding } from "~/lib/stats";

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
 * Wat een metriek aan verkeer kost, als drie streepjes.
 *
 * Stond hier eerst als "NEEDS A LOT OF TRAFFIC" in hoofdletters, en dat was
 * het luidste op het scherm terwijl het het minst belangrijke is. Drie
 * streepjes lezen in één oogopslag en - belangrijker - ze zijn over de rijen
 * heen te vergelijken zonder ze te lezen. Alles op dit scherm gaat over
 * dezelfde ruil: hoeveel zekerheid je eist en wat dat kost.
 */
function Meter({ niveau }: { niveau: "kort" | "middel" | "lang" }) {
  const hoog = niveau === "kort" ? 1 : niveau === "middel" ? 2 : 3;
  return (
    <span className={"meter meter--" + niveau}
          title={hoog === 1 ? "Settles fast" : hoog === 2 ? "Medium traffic" : "Needs a lot of traffic"}>
      {[1, 2, 3].map((n) => (
        <span key={n} className={"meter__streep" + (n <= hoog ? " meter__streep--aan" : "")} />
      ))}
    </span>
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

type Stap = 0 | 1 | 2 | 3 | 4;

const STAPPEN = ["Type", "Setup", "Goal", "Audience", "Review"];

const DEVICES = [
  { key: "mobile", naam: "Mobile", sub: "under 768px" },
  { key: "tablet", naam: "Tablet", sub: "768 – 1024px" },
  { key: "desktop", naam: "Desktop", sub: "1024px and up" },
];

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
              {/* De naam in een eigen span, zodat hij op een telefoon weg kan:
                  vijf namen naast elkaar passen daar niet en dan schoof stap 5
                  buiten beeld. */}
              <span className="wizard__naam">{label}</span>
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
          <span style={{ display: "flex", gap: 8, flex: "none" }}>
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
  templates, product, waarde, onKies, previewBasis, themaEditorUrl,
}: {
  templates: TemplateInfo[];
  product: ProductInfo;
  waarde: string;
  onKies: (s: string) => void;
  previewBasis: string | null;
  themaEditorUrl: string | null;
}) {
  const [handmatig, setHandmatig] = useState(false);
  const [open, setOpen] = useState(false);
  const [zoek, setZoek] = useState("");

  // Wat de controlegroep vandaag ziet: het template waar het product op staat.
  // Leeg betekent het standaardtemplate, want dat is wat Shopify pakt als er
  // geen suffix is ingesteld.
  const huidig = product.templateSuffix || null;
  const huidigNaam = huidig ? "product." + huidig : "product (default)";

  // Het eigen template van het product valt af: dat kiezen zou een test
  // opleveren waarin beide groepen precies dezelfde pagina krijgen.
  const keuzes = templates.filter((t) => t.suffix !== huidig);

  const gefilterd = useMemo(() => {
    const n = zoek.trim().toLowerCase();
    return n ? keuzes.filter((t) => t.suffix.toLowerCase().includes(n)) : keuzes;
  }, [keuzes, zoek]);

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
              <span style={{ display: "flex", gap: 8 }}>
                {previewBasis && (
                  <a className="btn btn--sm btn--iris" target="_blank" rel="noreferrer"
                     href={previewUrl(waarde)!}>Preview</a>
                )}
                <button type="button" className="btn btn--sm" onClick={() => setOpen(true)}>Change</button>
              </span>
            </>
          ) : (
            <>
              <span className="duel__leeg">Nothing chosen yet</span>
              <button type="button" className="btn btn--sm btn--iris" onClick={() => setOpen(true)}>
                Choose template
              </button>
            </>
          )}
        </div>
      </div>

      {open && (
        <Modal
          titel="Template for the test group"
          sub={
            keuzes.length
              ? keuzes.length + " template" + (keuzes.length === 1 ? "" : "s") +
                " in your live theme, apart from the one this product already uses."
              : "No other templates found in your live theme."
          }
          onSluit={() => setOpen(false)}
          voet={
            <>
              <span className="small muted">
                Need a new one? Duplicate a template in the theme editor — it shows up here after.
              </span>
              <span style={{ flex: 1 }} />
              {themaEditorUrl && (
                <a className="btn btn--sm" href={themaEditorUrl} target="_blank" rel="noreferrer">
                  Open theme editor
                </a>
              )}
              <button type="button" className="btn btn--sm"
                      onClick={() => { setHandmatig(true); setOpen(false); }}>
                Enter by hand
              </button>
            </>
          }
        >
          {!templates.length && (
            <div style={{ marginBottom: 12 }}>
              <Banner tone="warn">
                Experli cannot read your theme's templates yet. Deploy the app with the{" "}
                <code>read_themes</code> permission, then approve it in Shopify.
              </Banner>
            </div>
          )}

          {keuzes.length > 6 && (
            <input type="search" placeholder="Search templates" value={zoek}
                   onChange={(e) => setZoek(e.target.value)} style={{ marginBottom: 12 }} />
          )}

          <div className="lijst">
            {gefilterd.map((t) => (
              <div className="lijst__rij" key={t.suffix}>
                <button type="button" className="lijst__kies"
                        onClick={() => { onKies(t.suffix); setOpen(false); setZoek(""); }}>
                  <span className="lijst__naam">{t.suffix}</span>
                  <span className="lijst__meta"><code>product.{t.suffix}.{t.soort}</code></span>
                </button>
                {previewBasis && (
                  <a className="btn btn--sm" target="_blank" rel="noreferrer"
                     href={previewUrl(t.suffix)!}
                     onClick={(e) => e.stopPropagation()}>
                    Preview
                  </a>
                )}
              </div>
            ))}
            {!gefilterd.length && keuzes.length > 0 && (
              <p className="small muted" style={{ padding: 12 }}>Nothing matches that.</p>
            )}
          </div>
        </Modal>
      )}

      {handmatig && !waarde && (
        <div style={{ maxWidth: 340, marginTop: 12 }}>
          <span className="field__label">Template suffix</span>
          <input type="text" placeholder="new-design"
                 onChange={(e) => onKies(e.target.value.trim())} />
          <span className="field__hint">
            The part after the dot in <code>product.new-design.json</code>.{" "}
            {keuzes.length > 0 && (
              <button type="button" className="linkje"
                      onClick={() => { setHandmatig(false); setOpen(true); }}>
                Pick from the theme instead
              </button>
            )}
          </span>
        </div>
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
  const [open, setOpen] = useState(false);
  const [zoek, setZoek] = useState("");

  const live = themas.find((t) => t.rol === "MAIN") || null;
  const keuzes = themas.filter((t) => t.rol !== "MAIN");

  const gefilterd = useMemo(() => {
    const n = zoek.trim().toLowerCase();
    return n ? keuzes.filter((t) => t.naam.toLowerCase().includes(n)) : keuzes;
  }, [keuzes, zoek]);

  const preview = (num: number) =>
    winkelUrl ? winkelUrl.replace(/\/+$/, "") + "/?preview_theme_id=" + num : null;

  if (!themas.length) {
    return (
      <Banner tone="warn">
        No themes could be read. Experli needs the <code>read_themes</code> permission — deploy the
        app with that scope and approve it in Shopify.
      </Banner>
    );
  }

  return (
    <div className="field">
      <span className="field__label">Which theme against which</span>

      <div className="duel">
        <div className="duel__kant">
          <span className="duel__kop"><span className="swatch swatch--control" /> Control</span>
          <span className="duel__naam">{live?.naam ?? "(unknown)"}</span>
          <span className="duel__sub">published — every visitor sees this today</span>
          {winkelUrl && (
            <a className="btn btn--sm" target="_blank" rel="noreferrer" href={winkelUrl}>Preview</a>
          )}
        </div>

        <span className="duel__vs">vs</span>

        <div className="duel__kant">
          <span className="duel__kop"><span className="swatch swatch--test" /> Test</span>
          {waarde ? (
            <>
              <span className="duel__naam">{waarde.naam}</span>
              <span className="duel__sub">
                {waarde.snippet === false
                  ? "unpublished — snippet missing"
                  : "unpublished — served for the whole session"}
              </span>
              <span style={{ display: "flex", gap: 8 }}>
                {preview(waarde.num) && (
                  <a className="btn btn--sm btn--iris" target="_blank" rel="noreferrer"
                     href={preview(waarde.num)!}>Preview</a>
                )}
                <button type="button" className="btn btn--sm" onClick={() => setOpen(true)}>Change</button>
              </span>
            </>
          ) : (
            <>
              <span className="duel__leeg">Nothing chosen yet</span>
              <button type="button" className="btn btn--sm btn--iris"
                      disabled={!keuzes.length} onClick={() => setOpen(true)}>
                {keuzes.length ? "Choose theme" : "No unpublished themes"}
              </button>
            </>
          )}
        </div>
      </div>

      {waarde?.snippet === false && (
        <div style={{ marginTop: 12 }}>
          <Banner tone="error">
            <strong>{waarde.naam}</strong> does not have the Experli snippet. The test group would
            browse it without ever being measured. Add the snippet to that theme first — Start is
            blocked until it is there.
          </Banner>
        </div>
      )}

      {open && (
        <Modal
          titel="Theme for the test group"
          sub={keuzes.length + " unpublished theme" + (keuzes.length === 1 ? "" : "s") +
               ". Experli checks each one for the snippet it needs to measure."}
          onSluit={() => setOpen(false)}
          voet={<span className="small muted">
            A theme without the snippet can be picked, but not started.
          </span>}
        >
          {keuzes.length > 6 && (
            <input type="search" placeholder="Search themes" value={zoek}
                   onChange={(e) => setZoek(e.target.value)} style={{ marginBottom: 12 }} />
          )}
          <div className="lijst">
            {gefilterd.map((t) => (
              <div className="lijst__rij" key={t.id}>
                <button type="button" className="lijst__kies"
                        onClick={() => { onKies(t); setOpen(false); setZoek(""); }}>
                  <span className="lijst__naam">{t.naam}</span>
                  <span className="lijst__meta lijst__meta--pillen">
                    {/* Null betekent "niet kunnen bepalen", en dat is iets anders
                        dan ontbreken - daar hoort geen alarm bij. */}
                    {t.snippet === false && <span className="pill pill--draft">no snippet</span>}
                    {t.snippet === true && <span className="pill pill--active">ready</span>}
                    {t.bijgewerkt && <span>edited {t.bijgewerkt.slice(0, 10)}</span>}
                  </span>
                </button>
                {preview(t.num) && (
                  <a className="btn btn--sm" target="_blank" rel="noreferrer" href={preview(t.num)!}>
                    Preview
                  </a>
                )}
              </div>
            ))}
            {!gefilterd.length && (
              <p className="small muted" style={{ padding: 12 }}>Nothing matches that.</p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ── productkiezer voor de fototest ──────────────────────────────────────────

   Een raster met foto's in plaats van de lijst die de andere types gebruiken.

   Niet omdat het mooier staat. Bij een prijs- of templatetest kies je een
   product op naam, en dan is een regel met een handle en een prijs precies wat
   je nodig hebt. Bij een fototest kies je een product óm zijn foto's, en die
   staan in zo'n lijst als een duimnagel van dertig pixels naast tekst die er
   niet toe doet.

   Het aantal foto's staat erbij, want dat bepaalt of er hier überhaupt iets te
   testen valt. Producten met één foto blijven staan maar zijn niet te kiezen:
   ze weghalen zou de vraag "waarom staat dit product er niet bij" oproepen, en
   die vraag is met een grijs kaartje en het woord "1 photo" al beantwoord.  */

function FotoProductKiezer({
  products, picked, onPick,
}: {
  products: ProductInfo[];
  picked: ProductInfo | null;
  onPick: (p: ProductInfo | null) => void;
}) {
  const [q, setQ] = useState("");

  const zichtbaar = useMemo(() => {
    const n = q.trim().toLowerCase();
    const telling = (p: ProductInfo) => p.media?.length ?? 0;
    return products
      .filter((p) => !n || p.title.toLowerCase().includes(n) || p.handle.includes(n))
      // Bruikbare producten eerst, en daarbinnen de rijkste galerij bovenaan.
      // Wie niets intypt ziet dan meteen waar iets mee te doen valt in plaats
      // van drie rijen grijze kaartjes.
      .sort((a, b) => telling(b) - telling(a))
      .slice(0, 36);
  }, [products, q]);

  if (picked) {
    return (
      <div className="field">
        <span className="field__label">Product</span>
        <div className="picker__item" style={{ cursor: "default" }}>
          {picked.image
            ? <img className="picker__img" src={picked.image} alt="" />
            : <span className="picker__img" />}
          <span className="picker__body">
            <span className="picker__title" title={picked.title}>{picked.title}</span>
            <span className="picker__meta">
              <code>{picked.handle}</code>
              <span className="num">{picked.media?.length ?? 0} photos</span>
            </span>
          </span>
          <span style={{ display: "flex", gap: 8, flex: "none" }}>
            {picked.url && (
              <a className="btn btn--sm" href={picked.url} target="_blank" rel="noreferrer">Preview</a>
            )}
            <button type="button" className="btn btn--sm" onClick={() => onPick(null)}>Change</button>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="field">
      <span className="field__label">Product</span>
      <input type="search" placeholder="Search by name or handle" value={q}
             onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} />

      {!zichtbaar.length && (
        <p className="small muted" style={{ padding: 8 }}>Nothing matches that.</p>
      )}

      <div className="prodraster">
        {zichtbaar.map((p) => {
          const n = p.media?.length ?? 0;
          const kan = n > 1;
          return (
            <button type="button" key={p.id} disabled={!kan}
                    className={"prodkaart" + (kan ? "" : " is-uit")}
                    onClick={() => kan && onPick(p)}
                    title={kan ? p.title : p.title + " — only one photo, nothing to swap"}>
              <span className="prodkaart__beeld">
                {p.image && <img src={p.image} alt="" loading="lazy" />}
              </span>
              <span className="prodkaart__naam">{p.title}</span>
              <span className={"prodkaart__aantal" + (kan ? "" : " is-uit")}>
                {n === 0 ? "no photos" : n === 1 ? "1 photo" : n + " photos"}
              </span>
            </button>
          );
        })}
      </div>

      <span className="field__hint">
        Both groups buy this, at the same price — only which photo opens the gallery differs.
        A product needs at least two photos before there is anything to swap.
      </span>
    </div>
  );
}

function FotoKiezer({
  product, waarde, onKies, previewBasis,
}: {
  product: ProductInfo;
  /** 1-based positie in de galerij; 0 betekent nog niets gekozen. */
  waarde: number;
  onKies: (n: number) => void;
  previewBasis: string | null;
}) {
  const media = product.media ?? [];
  const eerste = media[0] ?? null;
  const gekozen = waarde ? media.find((m) => m.pos === waarde) ?? null : null;

  /* Foto 1 valt af. Die staat al vooraan, dus hem kiezen levert twee groepen
     op die exact dezelfde pagina zien - een test die per definitie niets kan
     meten, maar wel dagen loopt voordat iemand dat doorheeft. */
  const keuzes = media.filter((m) => m.pos > 1);

  if (!media.length) {
    return (
      <div className="field" style={{ marginTop: 16 }}>
        <span className="field__label">Which photo the test group opens on</span>
        <Banner tone="warn">
          Experli sees no photos on this product. Add them in Shopify first — there is nothing
          to reorder yet.
        </Banner>
      </div>
    );
  }

  if (!keuzes.length) {
    return (
      <div className="field" style={{ marginTop: 16 }}>
        <span className="field__label">Which photo the test group opens on</span>
        <Banner tone="warn">
          This product has one photo. A test needs a second one to put in front of it.
        </Banner>
      </div>
    );
  }

  return (
    <div className="field" style={{ marginTop: 16 }}>
      <span className="field__label">Which photo the test group opens on</span>

      <div className="duel">
        <div className="duel__kant">
          <span className="duel__kop"><span className="swatch swatch--control" /> Control</span>
          <div className="fotokiezer__groot">
            {eerste && <img src={eerste.url} alt={eerste.alt ?? ""} loading="lazy" />}
          </div>
          <span className="duel__sub">photo 1, the gallery as it is today</span>
          {previewBasis && (
            <a className="btn btn--sm" target="_blank" rel="noreferrer" href={previewBasis}>
              Preview
            </a>
          )}
        </div>

        <span className="duel__vs">vs</span>

        <div className="duel__kant">
          <span className="duel__kop"><span className="swatch swatch--test" /> Test</span>
          {gekozen ? (
            <>
              <div className="fotokiezer__groot">
                <img src={gekozen.url} alt={gekozen.alt ?? ""} loading="lazy" />
              </div>
              <span className="duel__sub">
                photo {gekozen.pos}, moved to the front
              </span>
            </>
          ) : (
            <>
              <div className="fotokiezer__groot fotokiezer__groot--leeg" />
              <span className="duel__leeg">Nothing chosen yet</span>
            </>
          )}
        </div>
      </div>

      {/* Alle kandidaten in beeld in plaats van achter een keuzelijst. Dit is
          het enige testtype waarbij de keuze zélf visueel is: welke foto het
          beste opent kun je niet aan een positienummer aflezen. */}
      <div className="fotokiezer__strip" role="radiogroup" aria-label="Photo for the test group">
        {keuzes.map((m) => (
          <button type="button" key={m.pos} role="radio" aria-checked={waarde === m.pos}
                  className={"fotokiezer__mini" + (waarde === m.pos ? " is-gekozen" : "")}
                  onClick={() => onKies(waarde === m.pos ? 0 : m.pos)}>
            <img src={m.url} alt={m.alt ?? ""} loading="lazy" />
            <span className="fotokiezer__nr">{m.pos}</span>
          </button>
        ))}
      </div>

      <span className="field__hint">
        Nothing else changes: same page, same price, same copy. Whatever moves is down to
        this one image.
      </span>
    </div>
  );
}

/* ── kassatest ───────────────────────────────────────────────────────────────

   Vijf mechanieken onder één testtype.

   Waarom niet vijf losse testtypes: voor de machinerie zijn ze identiek - zelfde
   indeling, zelfde kenmerk in de wagen, zelfde toewijzing van orders. Wat
   verschilt is alleen wat de testgroep in de kassa ziet, en dat is precies wat
   configuratie hoort te zijn. Het typescherm zou anders elf kaarten tellen
   waarvan er zes hetzelfde beloven.                                          */

const CK_SOORTEN = [
  {
    key: "banner",
    naam: "Message",
    kort: "A block with a line of text",
    uitleg:
      "The plainest version, and the one to start with. Reassurance about delivery, a returns " +
      "promise, a note about the guarantee — one sentence in a coloured block.",
  },
  {
    key: "trust",
    naam: "Reassurance list",
    kort: "A few short lines with icons",
    uitleg:
      "Three or four short claims under each other, each with an icon. No block, no colour: " +
      "these are not announcements but reassurances, and something that shouts reassures nobody.",
  },
  {
    key: "faq",
    naam: "FAQ",
    kort: "Questions they can open right there",
    uitleg:
      "Up to five questions with an answer folded underneath. Shipping times, returns, what is " +
      "in the box — the things people leave a checkout to go and look up, and often do not come " +
      "back from. Folded shut by default, so it costs no room until someone wants it.",
  },
  {
    key: "shipbar",
    naam: "Free shipping bar",
    kort: "How far off the free-shipping threshold they are",
    uitleg:
      "A progress bar with the amount still missing. The amount comes from the checkout itself, " +
      "so it can never disagree with the total the buyer sees below it.",
  },
  {
    key: "upsell",
    naam: "Add-on offer",
    kort: "A product they can add with one click",
    uitleg:
      "The only block that changes the order. It disappears once the item is in the cart, and " +
      "if adding fails it disappears too — a red error above the pay button costs more than a " +
      "missed upsell.",
  },
  {
    key: "verzending",
    naam: "Shipping options",
    kort: "Rename, reorder or hide delivery methods",
    uitleg:
      "Not a block but the list itself. \"Standard 5-7 days\" against \"Free — arrives Tuesday\" " +
      "is one of the few things in a checkout that changes what people actually pick. Only " +
      "possible on Plus, and only through a Shopify function — Experli sets that up for you.",
  },
];

/** Iconen die de kassa kent, met een naam die zegt waar je ze voor gebruikt. */
const CK_ICONEN = [
  { key: "checkmark", naam: "Check" },
  { key: "delivery", naam: "Delivery" },
  { key: "return", naam: "Returns" },
  { key: "lock", naam: "Secure" },
  { key: "discount", naam: "Discount" },
  { key: "gift", naam: "Gift" },
  { key: "info", naam: "Info" },
  { key: "star", naam: "Star" },
];

/** Eén kant van een blok-kassatest: waar hij staat en wat erin staat. */
type CkKant = {
  slot: string;
  kop: string;
  tekst: string;
  toon: string;
  items: { icoon: string; tekst: string }[];
  vragen: { v: string; a: string }[];
  drempel: string;
  onder: string;
  boven: string;
  variantId: string;
  titel: string;
  onderschrift: string;
  prijsTekst: string;
  knop: string;
  afbeelding: string;
};

const ckLeeg = (): CkKant => ({
  slot: "a", kop: "", tekst: "", toon: "info",
  items: [{ icoon: "checkmark", tekst: "" }],
  vragen: [{ v: "", a: "" }],
  drempel: "", onder: "You are {rest} away from free shipping.",
  boven: "You have free shipping.",
  variantId: "", titel: "", onderschrift: "", prijsTekst: "", knop: "Add", afbeelding: "",
});

/**
 * Van scherm naar wat er opgeslagen wordt.
 *
 * Alleen de velden die bij deze mechaniek horen. Alles meesturen zou de
 * configuratie vullen met een verzendbalkdrempel op een bannertest, en dan is
 * bij het teruglezen niet meer te zien wat er eigenlijk ingesteld was.
 *
 * Leeg betekent hier echt leeg: geen kant. De extensie leest dat als "toon
 * niets" en niet als "toon een leeg blok" - een lege banner in de kassa is een
 * storing, geen controlegroep.
 */
function ckNaarConfig(soort: string, k: CkKant): any | null {
  const basis = { slot: (k.slot || "a").trim().toLowerCase() };
  if (soort === "banner") {
    if (!k.tekst.trim()) return null;
    return { ...basis, kop: k.kop.trim(), tekst: k.tekst.trim(), toon: k.toon };
  }
  if (soort === "trust") {
    const items = k.items.filter((i) => i.tekst.trim())
      .map((i) => ({ icoon: i.icoon, tekst: i.tekst.trim() }));
    return items.length ? { ...basis, items } : null;
  }
  if (soort === "faq") {
    /* Een vraag zonder antwoord is een uitklapper die leeg opengaat, en een
       antwoord zonder vraag is niet te vinden. Allebei nodig dus. */
    const vragen = k.vragen.filter((q) => q.v.trim() && q.a.trim())
      .map((q) => ({ v: q.v.trim(), a: q.a.trim() }));
    return vragen.length ? { ...basis, kop: k.kop.trim(), vragen } : null;
  }
  if (soort === "shipbar") {
    const d = parseFloat(k.drempel);
    if (!Number.isFinite(d) || d <= 0) return null;
    return { ...basis, drempel: d, onder: k.onder.trim(), boven: k.boven.trim() };
  }
  if (soort === "upsell") {
    if (!k.variantId) return null;
    return {
      ...basis, variantId: k.variantId, kop: k.kop.trim(), titel: k.titel.trim(),
      onderschrift: k.onderschrift.trim(), prijsTekst: k.prijsTekst.trim(),
      knop: k.knop.trim() || "Add", afbeelding: k.afbeelding,
    };
  }
  return null;
}

/* ── de editors ──────────────────────────────────────────────────────────── */

function CkVelden({
  soort, kant, zet, producten, isControl,
}: {
  soort: string;
  kant: CkKant;
  zet: (v: Partial<CkKant>) => void;
  producten: ProductInfo[];
  isControl: boolean;
}) {
  if (soort === "banner") {
    return (
      <>
        <input type="text" value={kant.kop} placeholder="Heading (optional)"
               onChange={(e) => zet({ kop: e.currentTarget.value })} />
        <textarea rows={3} value={kant.tekst}
                  placeholder={isControl ? "Leave empty — this group sees nothing"
                                         : "Free shipping on every order over $50."}
                  onChange={(e) => zet({ tekst: e.currentTarget.value })} />
      </>
    );
  }

  if (soort === "trust") {
    const zetItem = (n: number, v: Partial<{ icoon: string; tekst: string }>) =>
      zet({ items: kant.items.map((it, i) => (i === n ? { ...it, ...v } : it)) });
    return (
      <div className="ckregels">
        {kant.items.map((it, n) => (
          <div className="ckregel" key={n}>
            <select value={it.icoon} onChange={(e) => zetItem(n, { icoon: e.currentTarget.value })}>
              {CK_ICONEN.map((i) => <option key={i.key} value={i.key}>{i.naam}</option>)}
            </select>
            <input type="text" value={it.tekst}
                   placeholder={isControl ? "Leave empty" : "Free returns within 30 days"}
                   onChange={(e) => zetItem(n, { tekst: e.currentTarget.value })} />
            {kant.items.length > 1 && (
              <button type="button" className="btn btn--sm"
                      onClick={() => zet({ items: kant.items.filter((_, i) => i !== n) })}>
                Remove
              </button>
            )}
          </div>
        ))}
        {/* Vier is de grens. Meer regels lezen niemand meer als geruststelling
            maar als een lijst voorwaarden, en dat is het tegenovergestelde van
            wat dit blok moet doen. */}
        {kant.items.length < 4 && (
          <button type="button" className="btn btn--sm"
                  onClick={() => zet({ items: [...kant.items, { icoon: "checkmark", tekst: "" }] })}>
            Add line
          </button>
        )}
      </div>
    );
  }

  if (soort === "faq") {
    const zetV = (n: number, v: Partial<{ v: string; a: string }>) =>
      zet({ vragen: kant.vragen.map((q, i) => (i === n ? { ...q, ...v } : q)) });
    return (
      <div className="ckregels">
        <input type="text" value={kant.kop} placeholder="Heading above the questions (optional)"
               onChange={(e) => zet({ kop: e.currentTarget.value })} />
        {kant.vragen.map((q, n) => (
          <div className="ckvraag" key={n}>
            <div className="ckvraag__kop">
              <span className="ckvraag__nr">{n + 1}</span>
              <input type="text" value={q.v}
                     placeholder={isControl ? "Leave empty" : "When will my order arrive?"}
                     onChange={(e) => zetV(n, { v: e.currentTarget.value })} />
              {kant.vragen.length > 1 && (
                <button type="button" className="btn btn--sm"
                        onClick={() => zet({ vragen: kant.vragen.filter((_, i) => i !== n) })}>
                  Remove
                </button>
              )}
            </div>
            <textarea rows={2} value={q.a} placeholder="The answer, folded underneath"
                      onChange={(e) => zetV(n, { a: e.currentTarget.value })} />
          </div>
        ))}
        {/* Vijf is de grens, en dat is geen willekeurig getal: een kassa met
            een lijst vragen erin nodigt uit tot lezen in plaats van tot
            afrekenen, en dan werkt dit blok tegen zichzelf. */}
        {kant.vragen.length < 5 && (
          <button type="button" className="btn btn--sm"
                  onClick={() => zet({ vragen: [...kant.vragen, { v: "", a: "" }] })}>
            Add question
          </button>
        )}
      </div>
    );
  }

  if (soort === "shipbar") {
    return (
      <>
        <input type="number" min="1" step="0.01" value={kant.drempel}
               placeholder={isControl ? "Leave empty — no bar for this group" : "50"}
               onChange={(e) => zet({ drempel: e.currentTarget.value })} />
        <input type="text" value={kant.onder}
               placeholder="You are {rest} away from free shipping."
               onChange={(e) => zet({ onder: e.currentTarget.value })} />
        <input type="text" value={kant.boven} placeholder="You have free shipping."
               onChange={(e) => zet({ boven: e.currentTarget.value })} />
        <span className="duel__sub">
          <code>{"{rest}"}</code> becomes the amount still missing, in the buyer&apos;s currency.
        </span>
      </>
    );
  }

  if (soort === "upsell") {
    return (
      <>
        <select value={kant.variantId}
                onChange={(e) => {
                  const id = e.currentTarget.value;
                  const p = producten.find((x) => x.variants.some((v) => v.id === id));
                  const v = p?.variants.find((x) => x.id === id);
                  zet({
                    variantId: id,
                    // Titel, prijs en foto meteen invullen. Ze blijven te
                    // wijzigen - een aanbod in de kassa mag anders heten dan
                    // de productpagina - maar niemand hoort ze over te typen.
                    titel: kant.titel || (p ? p.title : ""),
                    prijsTekst: kant.prijsTekst || (v ? geld(parseFloat(v.price) || 0) : ""),
                    afbeelding: kant.afbeelding || (p?.image ?? ""),
                  });
                }}>
          <option value="">{isControl ? "Nothing — this group sees no offer" : "Pick a product"}</option>
          {producten.flatMap((p) =>
            p.variants.map((v) => (
              <option key={v.id} value={v.id}>
                {p.title}{v.title && v.title !== "Default Title" ? " — " + v.title : ""}
              </option>
            )),
          )}
        </select>
        {kant.variantId && (
          <>
            <input type="text" value={kant.kop} placeholder="Section heading (optional)"
                   onChange={(e) => zet({ kop: e.currentTarget.value })} />
            <input type="text" value={kant.titel} placeholder="Product name as shown"
                   onChange={(e) => zet({ titel: e.currentTarget.value })} />
            <input type="text" value={kant.onderschrift} placeholder="One line underneath (optional)"
                   onChange={(e) => zet({ onderschrift: e.currentTarget.value })} />
            <input type="text" value={kant.prijsTekst} placeholder="Price as shown"
                   onChange={(e) => zet({ prijsTekst: e.currentTarget.value })} />
            <input type="text" value={kant.knop} placeholder="Add"
                   onChange={(e) => zet({ knop: e.currentTarget.value })} />
          </>
        )}
      </>
    );
  }

  return null;
}

/* ── verzendtest ─────────────────────────────────────────────────────────────

   Geen twee kanten, want er valt niets naast elkaar te zetten: de controlegroep
   krijgt de verzendopties zoals ze zijn, en dat is precies het punt.

   De twee grenzen die Shopify stelt staan hier in beeld en niet in een
   handleiding. Ze zijn allebei stil: hernoemen plakt de vervoerdernaam er
   ongevraagd voor, en een herordening die de goedkoopste optie van plek één
   duwt wordt geweigerd - en een geweigerde operatie is van buiten niet te zien.
   Dan loopt er een test die keurig meldt dat hij draait en niets doet.       */

function CkVerzending({
  methoden, hernoem, setHernoem, verberg, setVerberg, bovenaan, setBovenaan,
}: {
  methoden: VerzendMethode[];
  hernoem: { van: string; naar: string }[];
  setHernoem: (v: { van: string; naar: string }[]) => void;
  verberg: string[];
  setVerberg: (v: string[]) => void;
  bovenaan: string[];
  setBovenaan: (v: string[]) => void;
}) {
  const namen = methoden.map((m) => m.naam);

  if (!namen.length) {
    return (
      <Banner tone="warn">
        Experli cannot see any shipping methods on this store. That usually means the app has not
        been granted the shipping permission yet — reinstall it once and this list fills up.
      </Banner>
    );
  }

  const wissel = (lijst: string[], zet: (v: string[]) => void, naam: string) =>
    zet(lijst.includes(naam) ? lijst.filter((n) => n !== naam) : [...lijst, naam]);

  return (
    <div className="ckverzend">
      <div className="field">
        <span className="field__label">Rename for the test group</span>
        {methoden.map((m) => {
          const r = hernoem.find((x) => x.van === m.naam);
          return (
            <div className="ckregel" key={m.naam}>
              <span className="ckregel__naam">
                {m.naam}
                {m.prijs && <span className="muted"> · {m.prijs}</span>}
              </span>
              <input type="text" value={r?.naar ?? ""} placeholder="Leave empty to keep this name"
                     onChange={(e) => {
                       const naar = e.currentTarget.value;
                       const rest = hernoem.filter((x) => x.van !== m.naam);
                       setHernoem(naar ? [...rest, { van: m.naam, naar }] : rest);
                     }} />
            </div>
          );
        })}
        <span className="field__hint">
          Shopify puts the carrier name in front of whatever you write here, and that part cannot
          be removed. With UPS, &quot;Arrives Tuesday&quot; shows up as &quot;UPS Arrives
          Tuesday&quot;. Own flat rates usually have no carrier name, so there it reads exactly as
          you typed it.
        </span>
      </div>

      <div className="field">
        <span className="field__label">Hide for the test group</span>
        <div className="keuzerij">
          {namen.map((n) => (
            <button type="button" key={n}
                    className={"keuze" + (verberg.includes(n) ? " is-aan" : "")}
                    onClick={() => wissel(verberg, setVerberg, n)}>{n}</button>
          ))}
        </div>
        <span className="field__hint">
          Never all of them — a checkout with no shipping option cannot be completed, and that
          would show up in the results as a catastrophic loss rather than as the fault it is.
          Experli ignores the last one if you tick everything.
        </span>
      </div>

      <div className="field">
        <span className="field__label">Move to the top for the test group</span>
        <div className="keuzerij">
          {namen.map((n) => {
            const i = bovenaan.indexOf(n);
            return (
              <button type="button" key={n}
                      className={"keuze" + (i >= 0 ? " is-aan" : "")}
                      onClick={() => wissel(bovenaan, setBovenaan, n)}>
                {i >= 0 && <span className="keuze__nr">{i + 1}</span>}{n}
              </button>
            );
          })}
        </div>
        <span className="field__hint">
          Shopify will not let the cheapest option be pushed off the first place. Put a dearer one
          on top and Experli moves it to second instead, keeping the rest of your order — refusing
          outright would hand the test group the normal list without saying so.
        </span>
      </div>
    </div>
  );
}

/* De tonen die de kassa kent. Meer zijn het er niet: een vijfde waarde zou
   stil op de standaardkleur uitkomen en dan staat er iets anders dan je hebt
   ingesteld. */
const CK_TONEN = [
  { key: "info",     naam: "Neutral" },
  { key: "success",  naam: "Positive" },
  { key: "warning",  naam: "Attention" },
  { key: "critical", naam: "Urgent" },
];

/* ── wizard ──────────────────────────────────────────────────────────────── */

export function Wizard({
  producten, templates, themas, verzendmethoden, winkelUrl, shop, onKlaar,
}: {
  producten: ProductInfo[];
  templates: TemplateInfo[];
  themas: ThemaInfo[];
  verzendmethoden: VerzendMethode[];
  winkelUrl: string | null;
  /** Voor de deeplink naar de theme editor. */
  shop: string | null;
  onKlaar: () => void;
}) {
  const fetcher = useFetcher<{ ok: boolean; bericht: string }>();
  const bezig = fetcher.state !== "idle";

  /**
   * Wachten op het antwoord voordat de wizard dichtgaat.
   *
   * DIT SLOOT EERST METEEN. bewaar() deed fetcher.submit() en daarna onKlaar(),
   * zonder ooit naar fetcher.data te kijken. Ging het opslaan mis, dan verdween
   * het scherm en verscheen er niets in de lijst - het enige dat je zag was dat
   * je test weg was. De server gaf de reden keurig terug; die kwam alleen nergens
   * aan.
   *
   * Nu blijft de wizard staan bij een fout, met de reden erbij, zodat de
   * ingevulde velden ook blijven staan. Alles opnieuw moeten typen omdat de
   * server iets niet lustte is de tweede straf voor dezelfde fout.
   */
  const [verstuurd, setVerstuurd] = useState(false);
  const [bewaarFout, setBewaarFout] = useState<string | null>(null);

  useEffect(() => {
    if (!verstuurd || fetcher.state !== "idle" || !fetcher.data) return;
    setVerstuurd(false);
    if (fetcher.data.ok) onKlaar();
    else setBewaarFout(fetcher.data.bericht || "This test could not be saved.");
  }, [verstuurd, fetcher.state, fetcher.data, onKlaar]);

  const [stap, setStap] = useState<Stap>(0);
  const [type, setType] = useState<TestType>("price");

  const [naam, setNaam] = useState("");
  const [hypothese, setHypothese] = useState("");
  const [control, setControl] = useState<ProductInfo | null>(null);
  const [test, setTest] = useState<ProductInfo | null>(null);
  /* Welke foto de testgroep vooraan ziet, 1-based. Nul betekent "nog niet
     gekozen"; de eerste foto kiezen kan niet, want dan zijn de twee groepen
     identiek. */
  const [foto, setFoto] = useState(0);

  /* Wat de kassatest in de kassa doet. De controlekant mag leeg blijven: dat is
     de gewone vorm van deze test - verandert het iets als hier iets staat? */
  const [ckSoort, setCkSoort] = useState("banner");
  const [ckTest, setCkTest] = useState<CkKant>(ckLeeg());
  const [ckControl, setCkControl] = useState<CkKant>(ckLeeg());

  /* Krijgt de controlegroep ook iets te zien?
     Standaard niet, want dat is bij dit testtype veruit het gewone geval:
     "verandert het iets als hier iets staat". Hem toch altijd tonen betekende
     een volledige editor - bij een FAQ zelfs een genummerd vraagblok met een
     antwoordveld - voor een kant die je meestal leeg laat, en dat is precies
     de helft van de rommel op dit scherm. */
  const [ckControlAan, setCkControlAan] = useState(false);

  /* De verzendtest staat los. Hij heeft geen twee kanten om naast elkaar te
     zetten: de controlegroep krijgt de verzendopties zoals ze zijn, en dat is
     precies het punt. */
  const [vzHernoem, setVzHernoem] = useState<{ van: string; naar: string }[]>([]);
  const [vzVerberg, setVzVerberg] = useState<string[]>([]);
  const [vzBovenaan, setVzBovenaan] = useState<string[]>([]);
  const [suffix, setSuffix] = useState("");
  const [controlUrl, setControlUrl] = useState("");
  const [testUrl, setTestUrl] = useState("");
  const [thema, setThema] = useState<ThemaInfo | null>(null);
  const [split, setSplit] = useState("50");
  const [abo, setAbo] = useState(false);
  const [cycles, setCycles] = useState("1.8");

  const [metric, setMetric] = useState<MetricKey>("rpv");
  const [guardrails, setGuardrails] = useState<MetricKey[]>([]);
  const [confidence, setConfidence] = useState("95");
  const [mde, setMde] = useState("10");

  /**
   * Staan de instellingen open?
   *
   * Dicht bij het openen, want ze hebben allemaal al een antwoord. Wie iets wil
   * verzetten klapt ze open; de rest leest de regel en gaat door. Twee losse
   * schakelaars, want stap 3 en stap 4 open laten staan omdat je in de ander
   * iets aanpaste zou nergens op slaan.
   */
  const [fijnAf, setFijnAf] = useState(false);
  const [wieOpen, setWieOpen] = useState(false);
  const [devices, setDevices] = useState<string[]>([]);
  const [landen, setLanden] = useState("");

  const wissel = <T,>(lijst: T[], zet: (l: T[]) => void, waarde: T) =>
    zet(lijst.includes(waarde) ? lijst.filter((x) => x !== waarde) : [...lijst, waarde]);

  /**
   * Hoeveel verkeer deze opzet vraagt, vóórdat hij draait.
   *
   * Alleen voor metrieken die een verhouding zijn: daar volgt de spreiding uit
   * de verhouding zelf en kun je het dus vooraf uitrekenen. Voor omzet per
   * bezoeker en orderwaarde heb je de gemeten spreiding nodig, en die is er nog
   * niet - beter geen getal dan een verzonnen getal.
   */
  const raming = useMemo(() => {
    const m = metricInfo(metric);
    if (m.vorm !== "procent") return null;
    const basis = metric === "atc" ? 0.08 : metric === "sub_rate" ? 0.3 : 0.03;
    const n = benodigdVoorVerhouding(basis, Number(mde) || 0, Number(confidence) || 95);
    return n > 0 ? { n, basis, m } : null;
  }, [metric, mde, confidence]);

  const info = TYPES.find((t) => t.key === type)!;

  // Deeplink naar de theme editor van het live thema, om daar een template te
  // dupliceren. Dat scheelt de app write_themes, en dat is een fors mandaat
  // voor iets wat in de editor twee klikken is.
  const themaEditorUrl = useMemo(() => {
    const live = themas.find((t) => t.rol === "MAIN");
    const winkelNaam = shop?.replace(/\.myshopify\.com$/, "");
    return live && winkelNaam
      ? "https://admin.shopify.com/store/" + winkelNaam + "/themes/" + live.num + "/editor"
      : null;
  }, [themas, shop]);

  const koppeling = type === "price" && control && test ? matchVariants(control, test) : null;
  const vergelijking = type === "price" && control && test && koppeling
    ? prijsVergelijking(control, test, koppeling.pairs)
    : [];
  const zelfdePrijs = vergelijking.length > 0 && vergelijking.every((v) => Math.abs(v.verschil) < 0.005);

  /* De twee kanten zoals ze opgeslagen zouden worden. Op die vorm vergelijken
     en niet op de losse velden: een verschil dat er bij het opslaan toch
     uitvalt - een spatie, een regel zonder tekst - is geen verschil, en zou
     hier anders een test laten starten die per definitie niets meet. */
  const ckTestCfg = type === "checkout" ? ckNaarConfig(ckSoort, ckTest) : null;
  const ckControlCfg = type === "checkout" && ckControlAan ? ckNaarConfig(ckSoort, ckControl) : null;
  const ckGelijk = Boolean(ckTestCfg && ckControlCfg &&
    JSON.stringify(ckTestCfg) === JSON.stringify(ckControlCfg));

  /* Een verzendtest doet pas iets als er ten minste één operatie is. Zonder
     dat krijgt de testgroep exact dezelfde lijst als de controlegroep. */
  const vzIets = vzHernoem.some((r) => r.naar.trim()) || vzVerberg.length > 0 || vzBovenaan.length > 0;

  const setupKlaar =
    type === "price" ? Boolean(control && test && koppeling?.pairs.length)
    // Een foto kiezen die niet de eerste is: foto 1 vooraan zetten terwijl hij
    // daar al staat levert twee identieke groepen op.
    : type === "image" ? Boolean(control && foto && foto > 1)
    // De variant moet een ánder template zijn dan waar het product al op staat.
    : type === "template" ? Boolean(control && suffix.trim() && suffix.trim() !== control.templateSuffix)
    // Tekst voor de testgroep is genoeg; de controlekant mag leeg. Wel moeten
    // de twee verschillen als er allebei iets staat.
    : type === "checkout"
        ? (ckSoort === "verzending" ? vzIets : Boolean(ckTestCfg) && !ckGelijk)
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
    fd.set("primaryMetric", metric);
    fd.set("guardrails", guardrails.join(","));
    fd.set("confidence", confidence);
    fd.set("mde", mde);
    fd.set("targetDevices", devices.join(","));
    fd.set("targetCountries", landen);
    if (type === "price") { fd.set("control", control!.id); fd.set("test", test!.id); }
    if (type === "image") { fd.set("control", control!.id); fd.set("imagePositie", String(foto)); }
    if (type === "template") { fd.set("control", control!.id); fd.set("templateSuffix", suffix.trim()); }
    if (type === "url") { fd.set("controlUrl", controlUrl); fd.set("testUrl", testUrl); }
    if (type === "checkout") {
      fd.set("checkoutSoort", ckSoort);
      fd.set("checkoutConfig", JSON.stringify(
        ckSoort === "verzending"
          ? { hernoem: vzHernoem.filter((r) => r.naar.trim()), verberg: vzVerberg, bovenaan: vzBovenaan }
          : { test: ckTestCfg, control: ckControlCfg },
      ));
    }
    if (type === "theme") { fd.set("themeId", thema!.id); fd.set("themeName", thema!.naam); }
    setBewaarFout(null);
    setVerstuurd(true);
    fetcher.submit(fd, { method: "post" });
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

              {/* Vier kaarten met elk vier alinea's is vier keer lezen om één
                  keuze te maken. De lange uitleg hoort bij de kaart die je
                  overweegt, niet bij alle vier tegelijk - zelfde patroon als
                  bij de metrieken. */}
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
                    <span className="typekaart__mech">{t.mechaniek}</span>
                  </button>
                ))}
              </div>

              <div className="typeuitleg">
                <p>{info.uitleg}</p>
                <p className="typeuitleg__voor">
                  <span>Before you can start</span>
                  {info.voorbereiding}
                </p>
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
                    <div style={{ marginTop: 20 }}>
                      {zelfdePrijs && (
                        <div style={{ marginBottom: 12 }}>
                          <Banner tone="warn">
                            Both products have the same price — there is nothing to measure yet.
                          </Banner>
                        </div>
                      )}
                      {koppeling.unmatched.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <Banner tone="error">
                            <strong>Not matched:</strong> {koppeling.unmatched.join(", ")}. Those
                            variants fall outside the test.
                          </Banner>
                        </div>
                      )}
                      <div className="table-scroll vlak">
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

              {type === "image" && (
                <>
                  <div style={{ marginTop: 16 }}>
                    <FotoProductKiezer
                      products={producten} picked={control}
                      onPick={(p) => {
                        setControl(p);
                        // Een positie hoort bij één product. Blijft hij staan bij
                        // een wissel, dan wijst "foto 4" ineens naar een heel
                        // andere foto - of naar niets.
                        setFoto(0);
                      }} />
                  </div>
                  {control && (
                    <FotoKiezer
                      product={control}
                      waarde={foto}
                      onKies={setFoto}
                      previewBasis={
                        winkelUrl
                          ? winkelUrl.replace(/\/+$/, "") + "/products/" + control.handle
                          : control.url ?? null
                      }
                    />
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
                      themaEditorUrl={themaEditorUrl}
                    />
                  )}
                </>
              )}

              {type === "checkout" && (
                <div style={{ marginTop: 16 }}>
                  <div className="field">
                    <span className="field__label">What changes in the checkout</span>
                    <div className="soortraster">
                      {CK_SOORTEN.map((s) => (
                        <button type="button" key={s.key}
                                className={"soortkaart" + (ckSoort === s.key ? " is-aan" : "")}
                                onClick={() => setCkSoort(s.key)}>
                          <span className="soortkaart__naam">{s.naam}</span>
                          <span className="soortkaart__kort">{s.kort}</span>
                        </button>
                      ))}
                    </div>
                    <span className="field__hint">
                      {CK_SOORTEN.find((s) => s.key === ckSoort)?.uitleg}
                    </span>
                  </div>

                  {ckSoort === "verzending" ? (
                    <CkVerzending
                      methoden={verzendmethoden}
                      hernoem={vzHernoem} setHernoem={setVzHernoem}
                      verberg={vzVerberg} setVerberg={setVzVerberg}
                      bovenaan={vzBovenaan} setBovenaan={setVzBovenaan}
                    />
                  ) : (
                    <>
                      <Banner tone="info">
                        Place the <strong>Experli checkout</strong> block once in your checkout
                        editor, wherever you want this to appear. Every checkout test uses that
                        same spot afterwards.
                      </Banner>

                      <div className="duel" style={{ marginTop: 16 }}>
                        <div className="duel__kant">
                          <span className="duel__kop">
                            <span className="swatch swatch--control" /> Control
                          </span>
                          {ckControlAan ? (
                            <>
                              <CkVelden soort={ckSoort} kant={ckControl} producten={producten}
                                        isControl
                                        zet={(v) => setCkControl({ ...ckControl, ...v })} />
                              <button type="button" className="btn btn--sm"
                                      onClick={() => setCkControlAan(false)}>
                                Show this group nothing
                              </button>
                            </>
                          ) : (
                            <div className="ckleeg">
                              <span className="ckleeg__tekst">
                                This group sees the checkout as it is today.
                              </span>
                              <button type="button" className="btn btn--sm"
                                      onClick={() => setCkControlAan(true)}>
                                Give this group something too
                              </button>
                            </div>
                          )}
                          <span className="duel__sub">
                            {ckControlAan
                              ? "two versions against each other"
                              : "the usual choice: does adding anything help at all?"}
                          </span>
                        </div>

                        <span className="duel__vs">vs</span>

                        <div className="duel__kant">
                          <span className="duel__kop">
                            <span className="swatch swatch--test" /> Test
                          </span>
                          <CkVelden soort={ckSoort} kant={ckTest} producten={producten}
                                    isControl={false}
                                    zet={(v) => setCkTest({ ...ckTest, ...v })} />
                          <span className="duel__sub">what the test group sees in the checkout</span>
                        </div>
                      </div>

                      {ckSoort === "banner" && (
                        <div className="field" style={{ marginTop: 16 }}>
                          <span className="field__label">Tone</span>
                          <div className="keuzerij">
                            {CK_TONEN.map((t) => (
                              <button type="button" key={t.key}
                                      className={"keuze" + (ckTest.toon === t.key ? " is-aan" : "")}
                                      onClick={() => {
                                        setCkTest({ ...ckTest, toon: t.key });
                                        setCkControl({ ...ckControl, toon: t.key });
                                      }}>
                                <span className={"keuze__stip keuze__stip--" + t.key} />
                                {t.naam}
                              </button>
                            ))}
                          </div>
                          <span className="field__hint">
                            The colour of the block in the checkout. Both groups get the same tone —
                            if that differed too, you would not know which of the two changes moved
                            the number.
                          </span>
                        </div>
                      )}

                      {/* Plaatsing. Alleen zichtbaar als er meer dan één slot in
                          het spel is, want een winkel met één Experli-blok heeft
                          hier niets te kiezen en zou alleen een veld zien dat
                          vraagt om een letter waarvan hij de betekenis niet kent. */}
                      <details className="ckplaats">
                        <summary>Test the placement instead of the content</summary>
                        <p className="small muted">
                          Put the Experli block in two spots in your checkout editor and give each
                          one a letter. Fill in the same content on both sides here but a different
                          letter, and the only thing being tested is where it sits.
                        </p>
                        <div className="row">
                          <div className="field">
                            <span className="field__label">Control slot</span>
                            <input type="text" value={ckControl.slot} placeholder="a"
                                   onChange={(e) => setCkControl({ ...ckControl, slot: e.currentTarget.value })} />
                          </div>
                          <div className="field">
                            <span className="field__label">Test slot</span>
                            <input type="text" value={ckTest.slot} placeholder="a"
                                   onChange={(e) => setCkTest({ ...ckTest, slot: e.currentTarget.value })} />
                          </div>
                        </div>
                      </details>

                      {ckGelijk && (
                        <Banner tone="warn">
                          Both groups would see exactly the same thing in the same spot, so there is
                          nothing left to measure.
                        </Banner>
                      )}
                    </>
                  )}
                </div>
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

          {/* ── 3. goal ─────────────────────────────────────────────────── */}
          {stap === 2 && (
            <div className="tabinhoud doel">
              <h3 className="wizard__kop">What decides the winner</h3>
              <p className="wizard__sub">
                Locked in now, before the numbers are in — decide afterwards and you will pick
                whichever one happens to look good.
              </p>

              {/* De keuze is een lijst en geen raster: er wordt er één gekozen
                  en vier afgewezen, en de gekozen draagt zijn eigen uitleg in
                  plaats van een losse grijze slab eronder. */}
              <div className="doel__lijst">
                {METRICS.map((m) => {
                  const aan = metric === m.key;
                  return (
                    <button key={m.key} type="button" className="doelrij" aria-pressed={aan}
                            onClick={() => {
                              setMetric(m.key);
                              setGuardrails((g) => g.filter((x) => x !== m.key));
                            }}>
                      <span className="doelrij__vink" aria-hidden />
                      <span className="doelrij__body">
                        <span className="doelrij__regel">
                          <span className="doelrij__naam">{m.naam}</span>
                          <span className="doelrij__kort">{m.kort}</span>
                          <Meter niveau={m.duur} />
                        </span>
                        {aan && (
                          <span className="doelrij__uitleg">
                            {m.uitleg}
                            <em>{m.toetsnaam}</em>
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Alles hieronder heeft al een antwoord.

                  Het stond eerst even groot en even wit als de keuze erboven,
                  en dan weet je bij het openen niet waar je moet beginnen. Nu
                  toont het zijn eigen antwoord in plaats van zijn titel: je
                  leest wat er staat en klapt alleen open als het niet klopt. */}
              <div className="instel">
                <button type="button" className="instel__knop"
                        aria-expanded={fijnAf}
                        onClick={() => setFijnAf((v) => !v)}>
                  <span className="instel__tekst">
                    <span className="instel__label">How it is measured</span>
                    <span className="instel__antwoord">
                      <b>{confidence}%</b> confidence, looking for a <b>{mde}%</b> lift
                      {raming
                        ? <> &middot; about <b>{raming.n.toLocaleString("en-US")}</b> visitors per group</>
                        : <> &middot; size fills in after a day of traffic</>}
                      {guardrails.length > 0 && (
                        <> &middot; <b>{guardrails.length}</b>{" "}
                          {guardrails.length === 1 ? "guardrail" : "guardrails"}</>
                      )}
                    </span>
                  </span>
                  <span className="instel__actie">{fijnAf ? "Done" : "Adjust"}</span>
                </button>

                {fijnAf && (
                  <div className="instel__body">
                    <div className="instel__rij">
                      <div className="field" style={{ margin: 0 }}>
                        <span className="field__label">How sure do you need to be</span>
                        <Segmented
                          value={confidence}
                          options={[
                            { key: "90", label: "90%" },
                            { key: "95", label: "95%" },
                            { key: "99", label: "99%" },
                          ]}
                          onChange={setConfidence}
                        />
                        <span className="field__hint">
                          {confidence === "90" ? "Quicker answers, more false alarms. Fine for cheap, reversible changes."
                            : confidence === "99" ? "Slowest and strictest. For changes that are expensive to undo."
                            : "The usual choice."}
                        </span>
                      </div>

                      <div className="field" style={{ margin: 0 }}>
                        <span className="field__label">Smallest lift worth finding</span>
                        <div className="stapper">
                          <button type="button" onClick={() => setMde(String(Math.max(1, Number(mde) - 1)))}
                                  aria-label="Less">−</button>
                          <input type="number" min={1} max={100} value={mde}
                                 onChange={(e) => setMde(e.target.value)} className="num" />
                          <span className="stapper__eenheid">%</span>
                          <button type="button" onClick={() => setMde(String(Math.min(100, Number(mde) + 1)))}
                                  aria-label="More">+</button>
                        </div>
                        <span className="field__hint">
                          Halving this roughly quadruples the traffic you need.
                        </span>
                      </div>
                    </div>

                    {raming && raming.n > 40000 && (
                      <p className="field__hint" style={{ color: "var(--test)", marginTop: 12 }}>
                        {raming.n.toLocaleString("en-US")} visitors per group is a lot. Test a bigger
                        change, or pick a metric that moves earlier.
                      </p>
                    )}
                    {!raming && (
                      <p className="field__hint" style={{ marginTop: 12 }}>
                        {metricInfo(metric).naam} is sized from the spread in your own data, so the
                        number fills in after a day of traffic. Expect more than a rate-based metric
                        needs.
                      </p>
                    )}

                    <div className="field" style={{ marginTop: 18, marginBottom: 0 }}>
                      <span className="field__label">Guardrails</span>
                      <p className="field__hint" style={{ marginTop: 0, marginBottom: 8 }}>
                        These do not have to win — they only must not measurably lose.
                      </p>
                      <div className="doel__lijst doel__lijst--klein">
                        {METRICS.filter((m) => m.key !== metric).map((m) => (
                          <button key={m.key} type="button" className="doelrij doelrij--vink"
                                  aria-pressed={guardrails.includes(m.key)}
                                  onClick={() => wissel(guardrails, setGuardrails, m.key)}>
                            <span className="doelrij__vink" aria-hidden />
                            <span className="doelrij__body">
                              <span className="doelrij__regel">
                                <span className="doelrij__naam">{m.naam}</span>
                                <span className="doelrij__kort">{m.kort}</span>
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── 4. audience ─────────────────────────────────────────────── */}
          {stap === 3 && (
            <div className="tabinhoud doel">
              <h3 className="wizard__kop">Who gets it, and what to call it</h3>
              <p className="wizard__sub">
                Everything here you can change later except one thing: the split, once traffic has
                been counted against it.
              </p>

              {/* De verdeling is de beslissing van deze stap - het is het enige
                  wat je niet meer kunt terugdraaien - dus die houdt het wit en
                  de ruimte. De balk ís de knop: er stonden eerst twee dingen
                  onder elkaar die hetzelfde zeiden, een balk om naar te kijken
                  en een schuif om aan te trekken. Dit is de enige plek in de
                  flow waar je letterlijk iets in tweeën deelt; dan pak je de
                  naad. De schuif ligt er onzichtbaar overheen, zodat muis,
                  aanraking en toetsenbord alle drie gewoon werken. */}
              <div className="verdeling">
                <span className="field__label" style={{ margin: 0 }}>Traffic split</span>

                <div className="verdeling__spoor">
                  <span className="verdeling__helft verdeling__helft--control"
                        style={{ width: (100 - Number(split || 0)) + "%" }}>
                    {Number(split) <= 80 && <span>{100 - Number(split || 0)}% control</span>}
                  </span>
                  <span className="verdeling__helft verdeling__helft--test"
                        style={{ width: Number(split || 0) + "%" }}>
                    {Number(split) >= 20 && <span>{split}% test</span>}
                  </span>
                  <span className="verdeling__naad" style={{ left: (100 - Number(split || 0)) + "%" }} />
                  <input
                    className="verdeling__schuif"
                    type="range" min={1} max={99} step={1} value={split}
                    onChange={(e) => setSplit(e.target.value)}
                    aria-label="Percentage of traffic in the test group"
                  />
                </div>

                <span className="field__hint">
                  {split === "50"
                    ? "50/50 gets you an answer soonest — any other split needs more total traffic for the same certainty."
                    : "Off 50/50, so the smaller group decides how long this takes. It needs more total traffic than an even split would."}
                  {" "}Once traffic has been counted against it, this is fixed.
                </span>
              </div>

              <div className="veldkaart" style={{ marginTop: 16 }}>
                <span className="veldkaart__kop">Naming it</span>
                <div className="row" style={{ marginTop: 8 }}>
                  <div className="field" style={{ margin: 0 }}>
                    <input type="text" value={naam} placeholder="Name — e.g. Oregano +$4"
                           onChange={(e) => setNaam(e.target.value)} />
                  </div>
                  <div className="field" style={{ margin: 0 }}>
                    <input type="text" value={hypothese}
                           placeholder="What you expect to happen, and why"
                           onChange={(e) => setHypothese(e.target.value)} />
                  </div>
                </div>
                <span className="field__hint">
                  The name is for the list once several tests run at once. The expectation is for
                  your future self, who will not remember why this seemed like a good idea.
                </span>
              </div>

              {/* Targeting en het abonnementsvinkje hebben allebei al een
                  antwoord - iedereen, overal, en nee - dus die zakken weg en
                  tonen dat antwoord in plaats van hun titel. */}
              <div className="instel">
                <button type="button" className="instel__knop"
                        aria-expanded={wieOpen}
                        onClick={() => setWieOpen((v) => !v)}>
                  <span className="instel__tekst">
                    <span className="instel__label">Who sees it</span>
                    <span className="instel__antwoord">
                      <b>
                        {devices.length === 0 || devices.length === DEVICES.length
                          ? "Every device"
                          : devices.map((d) => DEVICES.find((x) => x.key === d)?.naam).join(", ")}
                      </b>
                      {", "}
                      <b>{landen.trim() ? landen.trim().toUpperCase() : "everywhere"}</b>
                      {abo && <> &middot; subscription forecast on</>}
                    </span>
                  </span>
                  <span className="instel__actie">{wieOpen ? "Done" : "Narrow it"}</span>
                </button>

                {wieOpen && (
                  <div className="instel__body">
                    <div className="instel__rij">
                      <div className="field" style={{ margin: 0 }}>
                        <span className="field__label">Devices</span>
                        <div className="doel__lijst doel__lijst--klein">
                          {DEVICES.map((d) => (
                            <button key={d.key} type="button" className="doelrij doelrij--vink"
                                    aria-pressed={devices.includes(d.key)}
                                    onClick={() => wissel(devices, setDevices, d.key)}>
                              <span className="doelrij__vink" aria-hidden />
                              <span className="doelrij__body">
                                <span className="doelrij__regel">
                                  <span className="doelrij__naam">{d.naam}</span>
                                  <span className="doelrij__kort">{d.sub}</span>
                                </span>
                              </span>
                            </button>
                          ))}
                        </div>
                        <span className="field__hint">
                          {devices.length
                            ? "Everyone else sees the original and is not counted at all."
                            : "None ticked means every device."}
                        </span>
                      </div>

                      <div className="field" style={{ margin: 0 }}>
                        <span className="field__label">Countries</span>
                        <input type="text" value={landen} placeholder="US, GB, DE"
                               onChange={(e) => setLanden(e.target.value)} />
                        <span className="field__hint">
                          Two-letter codes, comma separated. Empty means everywhere. Read from
                          Shopify localisation — the same country your prices and shipping run on.
                        </span>
                      </div>
                    </div>

                    <label className="schakelrij" style={{ marginTop: 16 }}>
                      <input type="checkbox" checked={abo} onChange={(e) => setAbo(e.target.checked)} />
                      <span className="schakelrij__body">
                        <span className="schakelrij__naam">This is a subscription product</span>
                        <span className="schakelrij__sub">
                          Adds a Forecast tab that projects the difference over a customer lifetime,
                          and works out how much retention the variant could afford to lose.
                        </span>
                      </span>
                      {abo && (
                        <span className="schakelrij__extra" onClick={(e) => e.preventDefault()}>
                          <input type="number" step="0.1" min={1} max={60} value={cycles}
                                 onChange={(e) => setCycles(e.target.value)} className="num"
                                 aria-label="Average billing cycles per customer" />
                          <span>cycles per customer</span>
                        </span>
                      )}
                    </label>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── 5. review ───────────────────────────────────────────────── */}
          {stap === 4 && (
            <div className="tabinhoud doel">
              <h3 className="wizard__kop">What will happen</h3>
              <p className="wizard__sub">
                Read it as a visitor would. This is the last cheap moment to spot a mistake.
              </p>

              {/* Dezelfde tegenoverstelling als in de opzetstap, zodat je hier
                  herkent wat je daar koos in plaats van het te moeten
                  hervertalen uit twee tabelregels. */}
              <div className="duel">
                <div className="duel__kant">
                  <span className="duel__kop"><span className="swatch swatch--control" /> Control</span>
                  <span className="duel__naam">
                    {type === "url" ? normaliseerPad(controlUrl)
                      : type === "checkout" ? (ckControlCfg ? "Your other version" : "The checkout as it is")
                      : type === "theme" ? (themas.find((t) => t.rol === "MAIN")?.naam ?? "live theme")
                      : type === "template" ? "product." + (control?.templateSuffix || "(default)")
                      : control?.title ?? "—"}
                  </span>
                  <span className="duel__sub">
                    {100 - Number(split || 0)}% of traffic · unchanged
                  </span>
                </div>

                <span className="duel__vs">vs</span>

                <div className="duel__kant">
                  <span className="duel__kop"><span className="swatch swatch--test" /> Test</span>
                  <span className="duel__naam">
                    {type === "price" ? test?.title ?? "—"
                      : type === "image" ? (control?.title ?? "—")
                      : type === "checkout" ? (CK_SOORTEN.find((x) => x.key === ckSoort)?.naam ?? "Checkout")
                      : type === "template" ? "product." + suffix
                      : type === "url" ? normaliseerPad(testUrl)
                      : thema?.naam ?? "—"}
                  </span>
                  <span className="duel__sub">
                    {split}% of traffic ·{" "}
                    {type === "price" ? "different price"
                      : type === "image" ? "photo " + foto + " shown first"
                      : type === "checkout" ? (ckSoort === "verzending" ? "different shipping options" : "in the checkout")
                      : type === "template" ? "?view=" + suffix
                      : type === "url" ? "sent from the other URL"
                      : "every page"}
                  </span>
                </div>
              </div>

              <div className="doel__onder">
                <div className="veldkaart">
                  <span className="veldkaart__kop">How it will be decided</span>
                  <div className="samenvat">
                    <div className="samenvat__rij">
                      <span>Winner decided on</span>
                      <strong>{metricInfo(metric).naam}</strong>
                    </div>
                    <div className="samenvat__rij">
                      <span>Confidence</span>
                      <strong className="num">{confidence}%</strong>
                    </div>
                    <div className="samenvat__rij">
                      <span>Smallest lift worth finding</span>
                      <strong className="num">{mde}%</strong>
                    </div>
                    {guardrails.length > 0 && (
                      <div className="samenvat__rij">
                        <span>Must not get worse</span>
                        <strong>{guardrails.map((g) => metricInfo(g).naam).join(", ")}</strong>
                      </div>
                    )}
                    {raming && (
                      <div className="samenvat__rij samenvat__rij--klem">
                        <span>Needs</span>
                        <strong className="num">
                          {raming.n.toLocaleString("en-US")} visitors per group
                        </strong>
                      </div>
                    )}
                  </div>
                </div>

                <div className="veldkaart">
                  <span className="veldkaart__kop">Who is in it</span>
                  <div className="samenvat">
                    <div className="samenvat__rij">
                      <span>Devices</span>
                      <strong>{devices.length ? devices.join(", ") : "all"}</strong>
                    </div>
                    <div className="samenvat__rij">
                      <span>Countries</span>
                      <strong>{landen.trim() ? landen.toUpperCase() : "all"}</strong>
                    </div>
                    {abo && (
                      <div className="samenvat__rij">
                        <span>Lifetime assumed</span>
                        <strong className="num">{cycles} cycles</strong>
                      </div>
                    )}
                    {naam.trim() && (
                      <div className="samenvat__rij">
                        <span>Named</span>
                        <strong>{naam}</strong>
                      </div>
                    )}
                  </div>
                  {hypothese.trim() && (
                    <p className="samenvat__hyp">“{hypothese}”</p>
                  )}
                </div>
              </div>

              <Banner tone="info">
                Saving does not start anything. The test sits as a draft until you press Start, and
                only then does it get checked and begin splitting traffic.
              </Banner>
            </div>
          )}

        </div>

        {/* Boven de knoppen en niet in een toast: de reden hoort te blijven
            staan naast de velden waar hij over gaat. */}
        {bewaarFout && (
          <div className="wizard__fout">
            <Banner tone="error">{bewaarFout}</Banner>
          </div>
        )}

        {/* ── navigatie ─────────────────────────────────────────────────── */}
        <div className="wizard__voet">
          <button className="btn" onClick={() => (stap === 0 ? onKlaar() : setStap((stap - 1) as Stap))}>
            {stap === 0 ? "Cancel" : "Back"}
          </button>
          <span style={{ flex: 1 }} />
          {stap < 4 ? (
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
