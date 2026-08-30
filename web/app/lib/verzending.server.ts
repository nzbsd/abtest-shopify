import supabase from "~/db.server";

/**
 * De verzendtest aan- en uitzetten in Shopify.
 *
 * WAAROM DIT BESTAAT
 * Een verzendtest wordt niet door de kassa-extensie uitgevoerd maar door een
 * Shopify Function, en een Function kan niets ophalen: geen netwerk, geen
 * database. Alles wat ze moet weten staat in haar invoer, en de enige plek
 * waar wij daar iets in kunnen zetten is een metafield op de delivery
 * customization. Dit bestand schrijft dat metafield.
 *
 * WAAROM EXPERLI DIT ZELF DOET EN HET NIET AAN JOU OVERLAAT
 * Het alternatief is een instructie in de trant van "maak in Shopify een
 * delivery customization aan, koppel hem aan de Experli-functie, en plak deze
 * JSON in een metafield". Dat is niet alleen onaangenaam, het is ook stil fout
 * te doen: een typefout in die JSON levert geen foutmelding op maar een
 * Function die niets doet, en dan loopt er een test die dagen later een
 * verschil van nul rapporteert.
 *
 * DIT IS HET ENIGE DAT EXPERLI IN JE WINKEL SCHRIJFT.
 * De rest van de app is bewust alleen-lezen: prijzen, thema's en producten
 * beheer jij. Hier kan dat niet, want de verzendopties zijn niet ergens anders
 * te beïnvloeden. De verandering blijft zo klein mogelijk: één customization
 * met een herkenbare naam, die uitgezet wordt zodra de test stopt.
 */

const FUNCTIES = `#graphql
  query ExperliVerzendFunctie {
    shopifyFunctions(first: 50, apiType: "delivery_customization") {
      nodes { id title apiType app { title } }
    }
  }
`;

const MAKEN = `#graphql
  mutation ExperliVerzendMaken($input: DeliveryCustomizationInput!) {
    deliveryCustomizationCreate(deliveryCustomization: $input) {
      deliveryCustomization { id }
      userErrors { field message }
    }
  }
`;

const BIJWERKEN = `#graphql
  mutation ExperliVerzendBijwerken($id: ID!, $input: DeliveryCustomizationInput!) {
    deliveryCustomizationUpdate(id: $id, input: $input) {
      deliveryCustomization { id }
      userErrors { field message }
    }
  }
`;

const METAFIELD = `#graphql
  mutation ExperliVerzendConfig($mf: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $mf) {
      metafields { id }
      userErrors { field message }
    }
  }
`;

/** De verzendopties zoals de winkel ze vandaag aanbiedt, voor het instelscherm. */
const ZONES = `#graphql
  query ExperliVerzendZones {
    deliveryProfiles(first: 10) {
      nodes {
        profileLocationGroups {
          locationGroupZones(first: 20) {
            nodes {
              methodDefinitions(first: 20) {
                nodes { name rateProvider { ... on DeliveryRateDefinition { price { amount currencyCode } } } }
              }
            }
          }
        }
      }
    }
  }
`;

async function vraag(admin: any, q: string, variables?: any) {
  const res = await admin.graphql(q, variables ? { variables } : undefined);
  const j = await res.json();
  if (j?.errors?.length) throw new Error(j.errors[0]?.message || "GraphQL error");
  return j?.data;
}

function eersteFout(blok: any): string | null {
  const f = blok?.userErrors?.[0];
  return f ? String(f.message || "Shopify refused the change.") : null;
}

/**
 * De namen van de verzendmethoden die deze winkel aanbiedt.
 *
 * Voor het instelscherm, zodat je uit een lijst kunt kiezen in plaats van een
 * naam over te typen. Dat is hier meer dan gemak: de Function matcht op titel,
 * en een titel die er één spatie naast zit vindt niets - waarna de testgroep
 * stil de gewone lijst krijgt en de test een verschil van nul meet.
 *
 * Ontdubbeld, want dezelfde methode staat vaak in meerdere zones. Voor de test
 * maakt dat niet uit: de Function raakt elke optie met die titel.
 */
export type VerzendMethode = { naam: string; prijs: string | null };

export async function verzendMethoden(admin: any): Promise<VerzendMethode[]> {
  try {
    const d = await vraag(admin, ZONES);
    const uit = new Map<string, VerzendMethode>();
    for (const p of d?.deliveryProfiles?.nodes ?? []) {
      for (const g of p?.profileLocationGroups ?? []) {
        for (const z of g?.locationGroupZones?.nodes ?? []) {
          for (const m of z?.methodDefinitions?.nodes ?? []) {
            const naam = String(m?.name ?? "").trim();
            if (!naam || uit.has(naam.toLowerCase())) continue;
            const bedrag = m?.rateProvider?.price;
            uit.set(naam.toLowerCase(), {
              naam,
              prijs: bedrag ? bedrag.amount + " " + bedrag.currencyCode : null,
            });
          }
        }
      }
    }
    return [...uit.values()];
  } catch {
    /* Geen lijst is vervelend maar niet fataal: het scherm laat je dan zelf
       een naam intypen. Een fout hier zou het hele testscherm blokkeren voor
       iets dat alleen bij één testtype nodig is. */
    return [];
  }
}

/** De Experli-verzendfunctie, of null als de app nog niet gedeployd is. */
async function functieId(admin: any): Promise<string | null> {
  const d = await vraag(admin, FUNCTIES);
  const nodes = d?.shopifyFunctions?.nodes ?? [];
  /* Op titel zoeken en niet blind de eerste pakken: een winkel kan meer apps
     hebben die verzendopties aanpassen, en de verkeerde aansturen zou hun
     instellingen overschrijven. */
  const mijn = nodes.find((n: any) => String(n?.title ?? "").toLowerCase().includes("experli"));
  return mijn?.id ?? null;
}

/**
 * De test aanzetten.
 *
 * Bestaat er al een customization voor deze test, dan wordt die bijgewerkt in
 * plaats van dat er een tweede bij komt. Een winkel mag er vijfentwintig
 * hebben, en een stapel wezen van gestopte tests zou die grens langzaam
 * opeten zonder dat iemand ziet waar ze vandaan komen.
 */
export async function verzendtestAan(
  admin: any, shop: string, testId: number, config: any,
): Promise<{ ok: boolean; bericht?: string }> {
  const fid = await functieId(admin);
  if (!fid) {
    return {
      ok: false,
      bericht:
        "Not started — Shopify does not know the Experli shipping function yet. " +
        "Deploy the app once, then try again.",
    };
  }

  const { data: rij } = await supabase
    .from("price_tests").select("checkout_customization_id")
    .eq("id", testId).eq("shop", shop).maybeSingle<{ checkout_customization_id: string | null }>();

  /* Het test-id gaat mee de configuratie in. De Function vergelijkt het met
     het kenmerk in de winkelwagen, zodat een kenmerk dat van een gestopte
     voorganger is blijven hangen niet de verzendopties van deze test stuurt. */
  const waarde = JSON.stringify({ ...config, testId });

  const input = {
    functionId: fid,
    title: "Experli test #" + testId,
    enabled: true,
    metafields: [{ namespace: "experli", key: "config", type: "json", value: waarde }],
  };

  try {
    let id = rij?.checkout_customization_id ?? null;

    if (id) {
      const d = await vraag(admin, BIJWERKEN, { id, input });
      const fout = eersteFout(d?.deliveryCustomizationUpdate);
      /* Weg in Shopify maar nog wel bij ons bekend: dan maken we hem opnieuw
         in plaats van te blijven hangen op een id dat niet meer bestaat. */
      if (fout) id = null;
    }

    if (!id) {
      const d = await vraag(admin, MAKEN, { input });
      const fout = eersteFout(d?.deliveryCustomizationCreate);
      if (fout) return { ok: false, bericht: "Not started — " + fout };
      id = d?.deliveryCustomizationCreate?.deliveryCustomization?.id ?? null;
      if (!id) return { ok: false, bericht: "Not started — Shopify returned no customization." };
      await supabase.from("price_tests")
        .update({ checkout_customization_id: id }).eq("id", testId).eq("shop", shop);
    }

    /* Het metafield nog een keer, los. Bij bijwerken neemt Shopify de
       metafields uit de input niet altijd mee, en een customization die met
       de configuratie van vorige week draait is erger dan een die niet
       draait: die verandert wél iets, alleen niet wat er in Experli staat. */
    const d = await vraag(admin, METAFIELD, {
      mf: [{ ownerId: id, namespace: "experli", key: "config", type: "json", value: waarde }],
    });
    const fout = eersteFout(d?.metafieldsSet);
    if (fout) return { ok: false, bericht: "Not started — " + fout };

    return { ok: true };
  } catch (e: any) {
    return { ok: false, bericht: "Not started — " + (e?.message ?? "Shopify refused the change.") };
  }
}

/**
 * De test uitzetten.
 *
 * Uitzetten en niet weggooien. Start je hem opnieuw, dan is het dezelfde
 * customization met dezelfde geschiedenis, en zolang hij uit staat doet hij
 * niets - een uitgeschakelde customization slaat geen enkele operatie over de
 * verzendopties heen.
 *
 * Mislukt dit, dan blijft de test in Experli gewoon gestopt. Dat is met opzet:
 * stoppen mag nooit blijven hangen op een fout, want stoppen ís vaak de
 * oplossing voor een probleem. Wel komt het terug als bericht, zodat je weet
 * dat er in Shopify nog iets uit moet.
 */
export async function verzendtestUit(
  admin: any, shop: string, testId: number,
): Promise<{ ok: boolean; bericht?: string }> {
  const { data: rij } = await supabase
    .from("price_tests").select("checkout_customization_id")
    .eq("id", testId).eq("shop", shop).maybeSingle<{ checkout_customization_id: string | null }>();

  const id = rij?.checkout_customization_id;
  if (!id) return { ok: true };

  try {
    const d = await vraag(admin, BIJWERKEN, { id, input: { enabled: false } });
    const fout = eersteFout(d?.deliveryCustomizationUpdate);
    if (fout) {
      return {
        ok: false,
        bericht:
          "Stopped in Experli, but Shopify kept the shipping customization on: " + fout +
          " Turn it off under Settings, Shipping and delivery, Customizations.",
      };
    }
    return { ok: true };
  } catch (e: any) {
    return {
      ok: false,
      bericht:
        "Stopped in Experli, but the shipping customization could not be switched off: " +
        (e?.message ?? "unknown error") +
        " Turn it off under Settings, Shipping and delivery, Customizations.",
    };
  }
}

/* ── gratis verzending ────────────────────────────────────────────────────────

   Een tweede Function, en een tweede manier om hem aan Shopify te hangen.

   experli-verzending is een delivery customization: die zit onder Instellingen,
   Verzending, Aanpassingen. Gratis verzending is een korting, dus die hangt aan
   een automatische app-korting onder Kortingen. Zelfde patroon - Experli maakt
   hem aan bij starten en haalt hem weg bij stoppen - maar andere mutaties.

   Weghalen en niet uitzetten, anders dan bij de delivery customization. Een
   uitgeschakelde korting blijft in de kortingenlijst staan, en een lijst met
   uitgezette Experli-kortingen van tests van vorige maand is precies het soort
   rommel waarvan later niemand meer durft te zeggen wat weg mag.              */

const KORTINGSFUNCTIES = `#graphql
  query ExperliKortingsFunctie {
    shopifyFunctions(first: 50, apiType: "discount") {
      nodes { id title }
    }
  }
`;

const KORTING_MAKEN = `#graphql
  mutation ExperliKortingMaken($input: DiscountAutomaticAppInput!) {
    discountAutomaticAppCreate(automaticAppDiscount: $input) {
      automaticAppDiscount { discountId }
      userErrors { field message }
    }
  }
`;

const KORTING_WEG = `#graphql
  mutation ExperliKortingWeg($id: ID!) {
    discountAutomaticDelete(id: $id) {
      deletedAutomaticDiscountId
      userErrors { field message }
    }
  }
`;

/**
 * Gratis verzending aanzetten voor de testgroep.
 *
 * De korting draait op elke wagen, maar de Function geeft alleen iets terug als
 * het cohort in die wagen "test" is en bij deze test hoort. De controlegroep
 * ziet dus geen kortingsregel - niet eentje van nul, maar geen.
 */
export async function gratisVerzendingAan(
  admin: any, shop: string, testId: number, config: any,
): Promise<{ ok: boolean; bericht?: string }> {
  let fid: string | null = null;
  try {
    const d = await vraag(admin, KORTINGSFUNCTIES);
    const nodes = d?.shopifyFunctions?.nodes ?? [];
    /* Op naam zoeken en niet blind de eerste pakken: een winkel kan meer apps
       met een kortingsfunctie hebben, en de verkeerde aansturen zou hun
       kortingen overschrijven. */
    const mijn = nodes.find((n: any) =>
      String(n?.title ?? "").toLowerCase().includes("free shipping") ||
      String(n?.title ?? "").toLowerCase().includes("gratis"));
    fid = mijn?.id ?? null;
  } catch (e: any) {
    return { ok: false, bericht: "Not started — " + (e?.message ?? "could not read the functions.") };
  }

  if (!fid) {
    return {
      ok: false,
      bericht:
        "Not started — Shopify does not know the Experli free shipping function yet. " +
        "Deploy the app once, then try again.",
    };
  }

  try {
    const d = await vraag(admin, KORTING_MAKEN, {
      input: {
        title: "Experli free shipping — test #" + testId,
        functionId: fid,
        startsAt: new Date().toISOString(),
        discountClasses: ["SHIPPING"],
        /* Combineren toestaan. Zonder dit blokkeert deze korting de codes die
           klanten zelf invoeren, en dan meet de test niet "helpt gratis
           verzending" maar "wat gebeurt er als hun kortingscode het niet doet". */
        combinesWith: { orderDiscounts: true, productDiscounts: true, shippingDiscounts: false },
        metafields: [{
          namespace: "experli", key: "config", type: "json",
          value: JSON.stringify({ ...config, testId }),
        }],
      },
    });
    const fout = eersteFout(d?.discountAutomaticAppCreate);
    if (fout) return { ok: false, bericht: "Not started — " + fout };

    const id = d?.discountAutomaticAppCreate?.automaticAppDiscount?.discountId ?? null;
    if (!id) return { ok: false, bericht: "Not started — Shopify returned no discount." };

    await supabase.from("price_tests")
      .update({ checkout_customization_id: id }).eq("id", testId).eq("shop", shop);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, bericht: "Not started — " + (e?.message ?? "Shopify refused the discount.") };
  }
}

/**
 * En weer weg.
 *
 * Mislukt dit, dan blijft de test in Experli gewoon gestopt - stoppen mag nooit
 * blijven hangen op een fout. Maar het komt wél terug als bericht, want een
 * korting die blijft draaien nadat de test gestopt is deelt gratis verzending
 * uit aan iedereen met een oud kenmerk in zijn wagen, en dat kost geld zonder
 * dat er nog iets gemeten wordt.
 */
export async function gratisVerzendingUit(
  admin: any, shop: string, testId: number,
): Promise<{ ok: boolean; bericht?: string }> {
  const { data: rij } = await supabase
    .from("price_tests").select("checkout_customization_id")
    .eq("id", testId).eq("shop", shop).maybeSingle<{ checkout_customization_id: string | null }>();

  const id = rij?.checkout_customization_id;
  if (!id) return { ok: true };

  try {
    const d = await vraag(admin, KORTING_WEG, { id });
    const fout = eersteFout(d?.discountAutomaticDelete);
    if (fout) {
      return {
        ok: false,
        bericht:
          "Stopped in Experli, but the free shipping discount is still live in Shopify: " + fout +
          " Remove it under Discounts.",
      };
    }
    await supabase.from("price_tests")
      .update({ checkout_customization_id: null }).eq("id", testId).eq("shop", shop);
    return { ok: true };
  } catch (e: any) {
    return {
      ok: false,
      bericht:
        "Stopped in Experli, but the free shipping discount could not be removed: " +
        (e?.message ?? "unknown error") + " Remove it under Discounts.",
    };
  }
}
