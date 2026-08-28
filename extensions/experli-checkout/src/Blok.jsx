/**
 * Experli in de kassa.
 *
 * WAT DIT DOET
 * De winkel deelt een bezoeker in bij een testgroep en schrijft die groep als
 * kenmerk in de winkelwagen (_pt_<testid>). Dat kenmerk reist mee de kassa in.
 * Dit blok leest het terug, haalt bij de app op wat er bij die groep hoort, en
 * tekent het. Hoort er bij die groep niets, dan tekent het niets.
 *
 * WAAROM DE INHOUD BIJ DE APP VANDAAN KOMT EN NIET UIT DE INSTELLINGEN
 * De instellingen van dit blok staan in de kassa-editor, en die kent geen
 * testgroepen: wat je daar invult ziet iedereen. Wat de twee groepen zien
 * hoort dus bij de test en staat in Experli. Wat wél in de editor thuishoort
 * is de plaats, want die kan alleen daar bepaald worden - vandaar de
 * instelling "slot" hieronder.
 *
 * SLOTS, EN WAAROM PLAATSING DAARMEE ZELF EEN TEST WORDT
 * Je kunt dit blok meer dan één keer neerzetten en elk exemplaar een letter
 * geven. De test zegt per groep in welk slot ze haar inhoud wil hebben. Zet je
 * voor beide groepen dezelfde tekst maar een ander slot, dan is dat een test
 * over de plaats en niets anders - en dat is precies de test waaruit je leert
 * dat het aan de plaats lag.
 *
 * ALS ER IETS MISGAAT GEBEURT ER NIETS
 * Geen antwoord, een kapot antwoord, geen kenmerk in de wagen: dan tekent dit
 * blok niets. Een kassa is de duurste plek van de winkel om een foutmelding
 * neer te zetten.
 */
import "@shopify/ui-extensions/preact";
import { Fragment, render } from "preact";
import { useEffect, useState } from "preact/hooks";

export default function extension() {
  render(<Blok />, document.body);
}

/** De kenmerken uit de wagen als gewoon object. */
function kenmerken() {
  const lijst = shopify.attributes?.value || [];
  const uit = {};
  for (const a of lijst) if (a && a.key) uit[a.key] = a.value;
  return uit;
}

function Blok() {
  const attrs = kenmerken();
  const [kant, setKant] = useState(null);
  const [soort, setSoort] = useState("");

  /* De basis-URL komt uit de instellingen van het blok, zodat een andere
     hosting geen nieuwe versie van de extensie vergt. */
  const app = String(shopify.settings?.value?.app_url || "https://abtest-shopify.vercel.app")
    .replace(/\/+$/, "");

  /* Welk exemplaar van dit blok ben ik? Leeg telt als "a", want dat is wat een
     winkel met één blok krijgt zonder er iets voor te hoeven invullen. */
  const mijnSlot = String(shopify.settings?.value?.slot || "a").trim().toLowerCase() || "a";
  const winkel = shopify.shop?.myshopifyDomain || "";

  useEffect(() => {
    if (!winkel) return;
    let levend = true;

    fetch(app + "/api/price-test?shop=" + encodeURIComponent(winkel))
      .then((r) => (r.ok ? r.json() : { tests: [] }))
      .then((data) => {
        if (!levend) return;

        for (const t of (data && data.tests) || []) {
          if (t.type !== "checkout") continue;

          /* De groep komt uit de wagen en wordt hier niet opnieuw bepaald.
             Zelf een indeling verzinnen zou een tweede bron van waarheid zijn,
             en die twee kunnen uit elkaar lopen: dan ziet iemand het blok van
             de testgroep terwijl zijn order als controle geteld wordt. */
          const cohort = attrs["_pt_" + t.id];
          if (cohort !== "control" && cohort !== "test") continue;

          /* De view telt zodra de bezoeker in de test zit, ook als deze groep
             niets te zien krijgt. Alleen tellen bij wél iets tonen zou de
             controlegroep uit de noemer laten vallen, en dan vergelijk je een
             conversie met niets. */
          meld(app, winkel, t.id, cohort, attrs["_pt_visitor"]);

          const z = cohort === "test" ? t.test : t.control;
          if (!z) return;
          if (String(z.slot || "a").toLowerCase() !== mijnSlot) return;

          setSoort(t.soort);
          setKant(z);
          return;
        }
      })
      .catch(() => { /* geen config, geen blok */ });

    return () => { levend = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winkel, mijnSlot]);

  if (!kant) return null;
  if (soort === "trust")   return <Vertrouwen v={kant} />;
  if (soort === "faq")     return <Faq v={kant} />;
  if (soort === "shipbar") return <Verzendbalk v={kant} />;
  if (soort === "upsell")  return <Upsell v={kant} />;
  return <Banner v={kant} />;
}

/* ── banner ──────────────────────────────────────────────────────────────── */

function Banner({ v }) {
  if (!v.tekst) return null;
  return (
    <s-banner tone={v.toon || "info"} heading={v.kop || undefined}>
      <s-text>{v.tekst}</s-text>
    </s-banner>
  );
}

/* ── vertrouwensrij ──────────────────────────────────────────────────────────

   Losse regels met een icoon, geen banner. Een banner roept "let op"; deze
   regels moeten juist rustig zijn - het zijn geen mededelingen maar
   geruststellingen, en iets wat schreeuwt stelt niemand gerust.             */

function Vertrouwen({ v }) {
  const items = Array.isArray(v.items) ? v.items.filter((i) => i && i.tekst) : [];
  if (!items.length) return null;
  return (
    <s-stack direction="block" gap="small-300">
      {items.map((i, n) => (
        <s-stack key={n} direction="inline" gap="small-200" blockAlignment="center">
          <s-icon type={i.icoon || "check-circle"} tone="neutral" size="small" />
          <s-text>{i.tekst}</s-text>
        </s-stack>
      ))}
    </s-stack>
  );
}

/* ── faq ─────────────────────────────────────────────────────────────────────

   Vragen met het antwoord eronder gevouwen.

   DICHT BEGINNEN, EN DAT IS NIET COSMETISCH.
   Een kassa met een lap tekst erin nodigt uit tot lezen in plaats van tot
   afrekenen. Gevouwen kost dit blok een paar regels en niets meer, en het gaat
   alleen open voor wie de vraag echt heeft - precies de persoon die anders de
   kassa verlaat om het ergens op te zoeken en niet terugkomt.

   WAAROM ER EEN KADER OMHEEN ZIT.
   Kale s-details onder elkaar zijn losse regels met een pijltje; die lezen niet
   als een lijst vragen maar als tekst die toevallig inklapt. Een rand eromheen
   en een streep ertussen maken er één ding van, en dat is precies wat een FAQ
   moet zijn: een plek waar je gaat kijken, niet iets wat je tegenkomt.

   DE VRAAG IS DE KOP, NIET HET KAARTLABEL.
   Andersom zou logischer lijken - "Common questions" bovenaan in het vet, de
   vragen eronder als tekst - maar dan is het grootste wat je leest precies het
   woord dat je niets vertelt. Je scant een FAQ op de vragen; die horen dus de
   koppen te zijn. Het label erboven mag klein en grijs: het zegt alleen wat
   voor blok dit is, en dat zie je toch al.

   VET EN NIET GROTER, EN DAT IS EEN AFWEGING GEWEEST.
   s-heading maakt de vraag wel groter, maar is een blok-element: het vult de
   regel, en de chevron die s-summary zelf tekent zakt dan naar de regel
   eronder. Dat leest als twee dingen in plaats van een rij die je aanklikt.

   De enige manier om groter en de chevron ernaast te krijgen is de rij zelf
   bouwen met s-clickable. Dat kost toetsenbordbediening - de documentatie zegt
   het met zoveel woorden - en dat is in een kassa geen ruil die je wilt maken
   voor een paar pixels lettergrootte.

   Dus s-text type="strong": vet, inline, chevron ernaast, en alles blijft
   bedienbaar zonder muis.

   Kader en strepen zijn ook alles wat er te sturen valt. Een kassa-extensie mag
   geen eigen CSS meesturen - dat is een bewuste grens van Shopify, zodat geen
   enkele app de kassa kan laten breken op een toestel dat jij nooit test.
   Vandaar de opmaakprops van de componenten zelf, en geen stylesheet.        */

function Faq({ v }) {
  const vragen = Array.isArray(v.vragen) ? v.vragen.filter((q) => q && q.v && q.a) : [];
  if (!vragen.length) return null;

  return (
    <s-box border="base" borderRadius="large-100" padding="none">
      {v.kop && (
        <>
          <s-box padding="base">
            <s-stack direction="inline" gap="small-200" blockAlignment="center">
              <s-icon type="question-circle" tone="neutral" size="small" />
              <s-text type="small" color="subdued">{v.kop}</s-text>
            </s-stack>
          </s-box>
          <s-divider />
        </>
      )}

      {vragen.map((q, n) => (
        <Fragment key={n}>
          {/* Een streep tussen de vragen, niet eronder en niet erboven. De kop
              zet zijn eigen streep, dus de eerste vraag heeft er geen nodig -
              en een laatste streep vlak boven de rand van het kader leest als
              een lege rij die er niet is. */}
          {n > 0 && <s-divider />}
          <s-box padding="base">
            <s-details>
              <s-summary>
                <s-text type="strong">{q.v}</s-text>
              </s-summary>
              <s-stack direction="block" gap="small-300">
                <s-text color="subdued">{q.a}</s-text>
              </s-stack>
            </s-details>
          </s-box>
        </Fragment>
      ))}
    </s-box>
  );
}

/* ── verzendbalk ─────────────────────────────────────────────────────────────

   Hoeveel scheelt het nog tot gratis verzending. Het bedrag komt uit de kassa
   zelf en niet uit de configuratie: dat is hetzelfde getal dat de koper
   onderaan ziet staan, dus de balk kan er nooit naast zitten.

   Is de drempel al gehaald, dan blijft de balk staan met de bevestiging erin.
   Hem dan weghalen zou het enige moment weggooien waarop deze boodschap goed
   nieuws is.                                                                */

function Verzendbalk({ v }) {
  const drempel = Number(v.drempel) || 0;
  const bedragObj = shopify.cost?.subtotalAmount?.value;
  const totaal = Number(bedragObj?.amount ?? NaN);
  if (!drempel || !Number.isFinite(totaal)) return null;

  const rest = Math.max(0, drempel - totaal);
  const gehaald = rest <= 0;
  const deel = Math.max(0, Math.min(1, totaal / drempel));

  let bedrag = String(rest);
  try {
    bedrag = new Intl.NumberFormat("en", {
      style: "currency", currency: bedragObj?.currencyCode || "USD",
    }).format(rest);
  } catch (e) { /* onbekende valuta: dan maar het kale getal */ }

  const tekst = gehaald
    ? (v.boven || "You have free shipping.")
    : String(v.onder || "You are {rest} away from free shipping.").replace("{rest}", bedrag);

  return (
    <s-stack direction="block" gap="small-300">
      <s-text>{tekst}</s-text>
      <s-progress value={deel} max={1} accessibilityLabel={tekst} />
    </s-stack>
  );
}

/* ── upsell ──────────────────────────────────────────────────────────────────

   Het enige blok dat iets aan de order verandert. Vandaar drie voorzorgen die
   de andere drie niet nodig hebben:

   - Staat het artikel al in de wagen, dan verdwijnt het aanbod. Iemand twee
     keer hetzelfde aanbieden leest als een storing, en toevoegen zou hier stil
     het aantal ophogen.
   - De knop gaat op slot zolang de wijziging loopt. De kassa laat twee klikken
     achter elkaar toe en zou er dan twee toevoegen.
   - Mislukt het, dan verdwijnt het blok in plaats van een fout te tonen. Een
     aanbod dat niet werkt is vervelend; een rode melding vlak boven de
     betaalknop is duurder.                                                   */

function Upsell({ v }) {
  const [bezig, setBezig] = useState(false);
  const [weg, setWeg] = useState(false);

  const lijnen = shopify.lines?.value || [];
  const erin = lijnen.some((l) => l && l.merchandise && l.merchandise.id === v.variantId);

  if (!v.variantId || erin || weg) return null;

  const toevoegen = async () => {
    if (bezig) return;
    setBezig(true);
    try {
      const r = await shopify.applyCartLinesChange({
        type: "addCartLine", merchandiseId: v.variantId, quantity: 1,
      });
      if (r && r.type === "error") setWeg(true);
    } catch (e) {
      setWeg(true);
    } finally {
      setBezig(false);
    }
  };

  return (
    <s-box border="base" borderRadius="large-100" padding="base">
      {v.kop && (
        <s-stack direction="block" gap="small-200">
          <s-text type="strong">{v.kop}</s-text>
        </s-stack>
      )}
      <s-stack direction="inline" gap="base" blockAlignment="center">
        {v.afbeelding && <s-image src={v.afbeelding} alt={v.titel || ""} inlineSize="60px" />}
        <s-stack direction="block" gap="small-500">
          <s-text type="strong">{v.titel}</s-text>
          {v.onderschrift && <s-text color="subdued">{v.onderschrift}</s-text>}
          {v.prijsTekst && <s-text>{v.prijsTekst}</s-text>}
        </s-stack>
        <s-button onClick={toevoegen} disabled={bezig} loading={bezig}>
          {v.knop || "Add"}
        </s-button>
      </s-stack>
    </s-box>
  );
}

/* ── meten ───────────────────────────────────────────────────────────────────

   Eén keer per kassabezoek. De kassa hertekent bij elke wijziging - een adres,
   een verzendmethode, een kortingscode - en dit blok tekent dan mee. Zonder
   deze rem zou één bezoeker tien views opleveren en zou de conversie een
   tiende zijn van wat ze is.

   sessionStorage bestaat niet in een web worker; een verzameling buiten de
   component leeft precies zolang als de extensie zelf, en dat is precies één
   kassabezoek.

   Staat het blok twee keer in de kassa (twee slots), dan houdt deze rem ook
   die tweede tegen: hij hangt aan het test-id, niet aan het blok.           */

const gemeld = new Set();
function meld(app, winkel, testId, cohort, visitor) {
  if (gemeld.has(testId)) return;
  gemeld.add(testId);

  /* text/plain, net als op de winkel: application/json is geen veilige content
     type voor CORS en zou een preflight vragen. De server leest het lichaam
     hoe dan ook als JSON. */
  fetch(app + "/api/price-test-event", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({
      shop: winkel, testId, cohort, eventType: "view",
      visitorId: visitor || "",
    }),
    keepalive: true,
  }).catch(() => { /* een mislukte meting mag de kassa nooit ophouden */ });
}
