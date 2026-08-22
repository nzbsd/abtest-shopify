// @ts-check

/**
 * Prijstest — geeft de CONTROLEGROEP het prijsverschil terug.
 *
 * WAAROM ANDERSOM:
 * Shopify kan de prijs niet per bezoeker verhogen; kortingen gaan alleen
 * omlaag. Daarom staat de echte productprijs op de HOOGSTE variant die we
 * testen, en krijgt de controlegroep hier het verschil terug. De testgroep
 * krijgt niets en betaalt dus de nieuwe prijs.
 *
 * Config-metafield ($app:price-test / function-configuration):
 * {
 *   "tests": [{
 *     "id": 12,
 *     "productId": "gid://shopify/Product/10829796737366",
 *     "markets": {
 *       "USD": { "controlDiscount": 2.00 },
 *       "GBP": { "controlDiscount": 2.00 }
 *     }
 *   }]
 * }
 * De markt wordt afgeleid uit de VALUTA van de regel. Dat is bewust: de
 * function krijgt geen market-handle mee, en valuta is wat de klant
 * daadwerkelijk betaalt.
 *
 * RAAKT DIT DE BUNDELS?
 * Nee. Regels met _bundle_free of _bundle_gift worden overgeslagen, dus deze
 * function en de bundle-function raken nooit dezelfde cartregel. Bovendien
 * staat de bundelkorting op combinesWith.productDiscounts = true, zodat beide
 * automatische kortingen naast elkaar mogen bestaan.
 */

const EMPTY = { operations: [] };

function attrValue(attr) {
  return attr && typeof attr.value === "string" ? attr.value : "";
}

function truthy(attr) {
  const v = attrValue(attr).toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

export function run(input) {
  const classes = input?.discount?.discountClasses || [];
  if (classes.length && !classes.includes("PRODUCT")) return EMPTY;

  // Alleen de controlegroep krijgt iets terug. Geen cohort = geen korting:
  // een bezoeker zonder toewijzing betaalt de prijs zoals hij in Shopify staat.
  const cohort = attrValue(input?.cart?.priceTestCohort).toLowerCase();
  if (cohort !== "control") return EMPTY;

  let config = input?.discount?.metafield?.jsonValue ?? {};
  if (typeof config === "string") {
    try { config = JSON.parse(config); } catch (_e) { config = {}; }
  }
  if (!config || typeof config !== "object") config = {};

  const tests = Array.isArray(config.tests) ? config.tests : [];
  if (!tests.length) return EMPTY;

  // De cohort is toegewezen voor één specifieke test. Hoort het attribuut bij
  // een test die niet meer loopt, dan doen we niets — anders zou een oude cart
  // een korting krijgen op een test die allang gestopt is.
  const testId = attrValue(input?.cart?.priceTestId);
  const test = testId
    ? tests.find((t) => String(t?.id) === testId)
    : null;
  if (!test || !test.productId) return EMPTY;

  const markets = (test.markets && typeof test.markets === "object") ? test.markets : {};
  const lines = input?.cart?.lines ?? [];
  const targets = [];

  for (const line of lines) {
    const m = line?.merchandise;
    if (!m || m.__typename !== "ProductVariant") continue;

    // Bundelregels laten we met rust — zie de toelichting bovenaan.
    if (truthy(line.bundleFree) || truthy(line.bundleGift)) continue;

    if (m.product?.id !== test.productId) continue;

    const per = line?.cost?.amountPerQuantity;
    const currency = per?.currencyCode;
    if (!currency) continue;

    const marketCfg = markets[currency];
    const korting = Number(marketCfg?.controlDiscount);
    if (!Number.isFinite(korting) || korting <= 0) continue;

    // Nooit meer teruggeven dan de regel kost: een korting groter dan de prijs
    // zou Shopify weigeren en de hele candidate ongeldig maken.
    const stukprijs = Number(per?.amount);
    if (!Number.isFinite(stukprijs) || stukprijs <= 0) continue;
    const perStuk = Math.min(korting, stukprijs);

    targets.push({
      cartLine: { id: line.id },
      // Bedrag geldt per regel, dus vermenigvuldigen met het aantal.
      _amount: (perStuk * (line.quantity || 1)).toFixed(2),
    });
  }

  if (!targets.length) return EMPTY;

  // Per bedrag groeperen: de Discount API rekent één waarde per candidate af,
  // dus regels met een verschillend kortingsbedrag krijgen hun eigen candidate.
  const perBedrag = {};
  for (const t of targets) {
    const key = t._amount;
    if (!perBedrag[key]) perBedrag[key] = [];
    perBedrag[key].push({ cartLine: { id: t.cartLine.id } });
  }

  const candidates = Object.keys(perBedrag).map((bedrag) => ({
    // Naamloos houden: de klant hoort geen "korting" te zien, dit is de
    // normale prijs voor deze groep.
    message: "",
    targets: perBedrag[bedrag],
    value: { fixedAmount: { amount: bedrag } },
  }));

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          selectionStrategy: "ALL",
        },
      },
    ],
  };
}
