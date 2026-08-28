/**
 * Experli in de kassa.
 *
 * WAT DIT DOET
 * De winkel deelt een bezoeker in bij een testgroep en schrijft die groep als
 * kenmerk in de winkelwagen (_pt_<testid>). Dat kenmerk reist mee de kassa in.
 * Dit blok leest het terug, haalt bij de app op wat er bij die groep hoort, en
 * tekent het. Ziet de controlegroep niets, dan tekent het niets.
 *
 * WAAROM DE INHOUD BIJ DE APP VANDAAN KOMT EN NIET UIT DE INSTELLINGEN
 * De instellingen van dit blok staan in de kassa-editor, en daar is één
 * exemplaar van. Twee varianten zouden twee blokken zijn - allebei zichtbaar
 * voor iedereen, want de editor kent geen testgroepen. Wat de twee groepen
 * zien hoort bij de test; de plaats van het blok hoort bij de kassa. Dus staat
 * de plaats hier en de inhoud in Experli, en hoef je de editor na één keer
 * neerzetten nooit meer aan te raken.
 *
 * WAAROM DE VIEW HIER GEMELD WORDT EN NIET OP DE WINKEL
 * Een kassatest kan alleen iets veranderen voor wie de kassa haalt. Zou de
 * winkel de view melden, dan draaide dat op elke pagina en stond straks
 * iedereen die ooit iets bekeken heeft in de noemer - dan meet de conversie
 * "van willekeurige pagina naar order" in plaats van "van kassa naar order",
 * en verdwijnt het effect van een blok in de kassa in de ruis.
 *
 * ALS ER IETS MISGAAT GEBEURT ER NIETS
 * Geen antwoord, een kapot antwoord, geen kenmerk in de wagen: dan tekent dit
 * blok niets. Een kassa is de duurste plek van de winkel om een foutmelding
 * neer te zetten.
 */
import "@shopify/ui-extensions/preact";
import { render } from "preact";
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
  const [inhoud, setInhoud] = useState(null);

  /* De basis-URL komt uit de instellingen van het blok, zodat een andere
     hosting geen nieuwe versie van de extensie vergt. Staat hij leeg, dan
     valt hij terug op waar Experli nu draait. */
  const app = String(shopify.settings?.value?.app_url || "https://abtest-shopify.vercel.app")
    .replace(/\/+$/, "");
  const winkel = shopify.shop?.myshopifyDomain || "";

  useEffect(() => {
    if (!winkel) return;
    let levend = true;

    fetch(app + "/api/price-test?shop=" + encodeURIComponent(winkel))
      .then((r) => (r.ok ? r.json() : { tests: [] }))
      .then((data) => {
        if (!levend) return;

        const tests = (data && data.tests) || [];
        for (const t of tests) {
          if (t.type !== "checkout" || !t.checkout) continue;

          /* De groep komt uit de wagen en wordt hier niet opnieuw bepaald.
             Zelf een indeling verzinnen zou een tweede bron van waarheid zijn,
             en die twee kunnen uit elkaar lopen: dan ziet iemand het blok van
             de testgroep terwijl zijn order als controle geteld wordt. */
          const cohort = attrs["_pt_" + t.id];
          if (cohort !== "control" && cohort !== "test") continue;

          const kant = cohort === "test" ? t.checkout.test : t.checkout.control;
          meld(app, winkel, t.id, cohort, attrs["_pt_visitor"]);
          if (kant && kant.tekst) { setInhoud(kant); return; }
        }
      })
      .catch(() => { /* geen config, geen blok */ });

    return () => { levend = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winkel]);

  if (!inhoud) return null;

  return (
    <s-banner tone={inhoud.toon || "info"} heading={inhoud.kop || undefined}>
      <s-text>{inhoud.tekst}</s-text>
    </s-banner>
  );
}

/**
 * De view melden, één keer per kassa.
 *
 * De kassa hertekent bij elke wijziging - een adres, een verzendmethode, een
 * kortingscode - en dit blok tekent dan mee. Zonder deze rem zou één bezoeker
 * tien views opleveren en zou de conversie een tiende zijn van wat ze is.
 *
 * sessionStorage is er niet in een web worker; een variabele buiten de
 * component leeft precies zolang als de extensie zelf, en dat is precies één
 * kassabezoek.
 */
const gemeld = new Set();
function meld(app, winkel, testId, cohort, visitor) {
  if (gemeld.has(testId)) return;
  gemeld.add(testId);

  /* text/plain, net als op de winkel: application/json is geen veilige
     content type voor CORS en zou een preflight vragen. De server leest het
     lichaam hoe dan ook als JSON. */
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
