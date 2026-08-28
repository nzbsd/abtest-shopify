// @ts-check

/**
 * Experli — verzendmethoden voor de testgroep.
 *
 * Dit is het enige testtype dat niet in de kassa-UI zit maar in de berekening
 * ervóór. Een kassa-extensie kan een blok naast de verzendopties zetten maar
 * niets aan de lijst zelf veranderen; hernoemen, herordenen en verbergen kan
 * alleen met een Shopify Function, en dit is die Function.
 *
 * WAT ER BINNENKOMT
 * - De instellingen, uit een metafield op de delivery customization. Een
 *   Function kan niets ophalen - geen netwerk, geen database - dus alles wat ze
 *   moet weten staat in haar invoer. Experli schrijft dat metafield als de test
 *   start en leegt het als hij stopt.
 * - Het cohort, uit de winkelwagen, onder de vaste sleutel _pt_ck. Het thema
 *   zet die naast de gewone _pt_<testid>, want dit bestand wordt bij het
 *   bouwen vastgelegd en kan geen id in een sleutel invullen.
 *
 * DE CONTROLEGROEP KRIJGT NOOIT EEN OPERATIE.
 * Niet "dezelfde operaties" of "een lege lijst met een omweg" - letterlijk
 * niets. Dat is wat een controlegroep is: de winkel zoals hij zonder deze test
 * zou draaien. Elke twijfel hier valt dezelfde kant op, want een bezoeker die
 * ten onrechte de normale verzendopties ziet kost een meting; een bezoeker die
 * ten onrechte een aangepaste lijst ziet kost een order.
 *
 * TWEE GRENZEN DIE SHOPIFY STELT EN DIE HIER ZICHTBAAR MOETEN BLIJVEN
 * - Hernoemen plakt de vervoerdernaam er verplicht vóór. "Standard" bij UPS
 *   wordt "UPS <jouw tekst>", en die "UPS" krijg je er niet af.
 * - Herordenen mag de goedkoopste optie niet uit de eerste plek duwen. Daarom
 *   sorteert deze Function de gevraagde volgorde zo dat de goedkoopste vooraan
 *   blijft in plaats van de operatie te laten weigeren - een geweigerde
 *   operatie is van buiten niet te zien en zou de testgroep stil de gewone
 *   lijst geven, waarna de test een verschil van nul rapporteert.
 */

/**
 * @typedef {{handle: string, title?: string|null, cost?: {amount: string|number}|null}} Optie
 */

export function run(input) {
  const leeg = { operations: [] };

  const cfg = input?.deliveryCustomization?.metafield?.jsonValue;
  if (!cfg || typeof cfg !== "object") return leeg;

  /* Alleen de testgroep. Zie de kop: de controlegroep krijgt de winkel zoals
     hij zonder deze test zou draaien. */
  if (input?.cart?.cohort?.value !== "test") return leeg;

  /* En alleen als dit cohort van déze test komt. Zonder deze controle zou een
     kenmerk dat in een oude winkelwagen is blijven hangen - van een kassatest
     die vorige week gestopt is - de verzendopties van de volgende test gaan
     sturen, en dat is van buiten aan niets te zien. */
  if (String(input?.cart?.vanTest?.value ?? "") !== String(cfg.testId ?? "")) return leeg;

  /** @type {Optie[]} */
  const opties = [];
  for (const groep of input?.cart?.deliveryGroups ?? []) {
    for (const o of groep?.deliveryOptions ?? []) if (o?.handle) opties.push(o);
  }
  if (!opties.length) return leeg;

  const naam = (o) => String(o.title ?? "").trim();
  const prijs = (o) => {
    const n = Number(o?.cost?.amount);
    return Number.isFinite(n) ? n : Infinity;
  };

  /* Op titel matchen en niet op handle. Een handle is een hash die per winkel,
     per zone en soms per herberekening anders is; die kun je in een instelscherm
     niet aanbieden en zou een dag later al niet meer kloppen. De titel is wat
     de koper ziet en wat jij in Experli hebt ingetypt.

     Hoofdletterongevoelig en zonder buitenste spaties: "Standard " en "standard"
     zijn dezelfde optie, en dat verschil is bij het overtypen zo gemaakt. */
  const gelijk = (a, b) => a.trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
  const zoek = (titel) => opties.filter((o) => gelijk(naam(o), titel));

  const operations = [];

  /* ── verbergen ────────────────────────────────────────────────────────────
     Als eerste, zodat hernoemen en herordenen niet aan opties werken die er
     straks toch niet meer zijn.

     Nooit alles verbergen. Een kassa zonder enkele verzendoptie laat de koper
     niet afrekenen, en dat is geen test maar een storing - een die bovendien
     precies één groep raakt en dus als een dramatisch verlies in de uitslag
     verschijnt in plaats van als een fout. */
  const verborgen = new Set();
  for (const titel of Array.isArray(cfg.verberg) ? cfg.verberg : []) {
    for (const o of zoek(titel)) verborgen.add(o.handle);
  }
  if (verborgen.size >= opties.length) verborgen.clear();
  for (const handle of verborgen) operations.push({ deliveryOptionHide: { deliveryOptionHandle: handle } });

  const over = opties.filter((o) => !verborgen.has(o.handle));

  /* ── hernoemen ────────────────────────────────────────────────────────── */
  for (const r of Array.isArray(cfg.hernoem) ? cfg.hernoem : []) {
    const naarTekst = String(r?.naar ?? "").trim();
    if (!naarTekst) continue;
    for (const o of over) {
      if (!gelijk(naam(o), r?.van)) continue;
      operations.push({
        deliveryOptionRename: { deliveryOptionHandle: o.handle, title: naarTekst },
      });
    }
  }

  /* ── herordenen ───────────────────────────────────────────────────────────

     De gevraagde volgorde eerst, daarna de rest in de volgorde die er al was.

     En dan de correctie waar Shopify op staat: de goedkoopste optie moet de
     eerste blijven. Zet je in Experli een duurdere optie bovenaan, dan wordt
     die niet geweigerd maar naar plek twee geschoven - de rest van jouw
     volgorde blijft overeind. Weigeren zou hier het slechtste antwoord zijn:
     dan krijgt de testgroep stil de gewone lijst en meet de test niets,
     terwijl het scherm keurig zegt dat hij loopt. */
  const gevraagd = Array.isArray(cfg.bovenaan) ? cfg.bovenaan : [];
  if (gevraagd.length && over.length > 1) {
    const rang = new Map();
    let i = 0;
    for (const titel of gevraagd) {
      for (const o of zoek(titel)) if (!verborgen.has(o.handle) && !rang.has(o.handle)) rang.set(o.handle, i++);
    }

    if (rang.size) {
      const volgorde = [...over].sort((a, b) => {
        const ra = rang.has(a.handle) ? rang.get(a.handle) : Number.MAX_SAFE_INTEGER;
        const rb = rang.has(b.handle) ? rang.get(b.handle) : Number.MAX_SAFE_INTEGER;
        if (ra !== rb) return ra - rb;
        return over.indexOf(a) - over.indexOf(b);
      });

      const goedkoopste = over.reduce((a, b) => (prijs(b) < prijs(a) ? b : a));
      const nu = volgorde.indexOf(goedkoopste);
      if (nu > 0) {
        volgorde.splice(nu, 1);
        volgorde.unshift(goedkoopste);
      }

      volgorde.forEach((o, index) => {
        operations.push({ deliveryOptionMove: { deliveryOptionHandle: o.handle, index } });
      });
    }
  }

  return { operations };
}
