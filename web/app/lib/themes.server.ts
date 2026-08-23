/**
 * Thema's en producttemplates uitlezen.
 *
 * Twee testtypes leunen hierop:
 *
 *   page design - kiezen uit de alternatieve producttemplates die er al zijn.
 *                 Op deze winkel staan er veertien; die laten intypen was
 *                 vragen om een typefout die pas opvalt als de test al een dag
 *                 draait en de testgroep gewoon de standaardpagina zag.
 *
 *   theme       - een heel onuitgegeven thema tegen het live thema.
 *
 * Vereist de scope read_themes. Zonder die scope geven de functies hieronder
 * een lege lijst terug in plaats van te klappen: het dashboard moet blijven
 * werken, ook als de winkel de nieuwe rechten nog niet heeft goedgekeurd.
 */

export type ThemaInfo = {
  /** gid://shopify/OnlineStoreTheme/123 */
  id: string;
  /** Het kale nummer, want dat gaat in ?preview_theme_id= */
  num: number;
  naam: string;
  /** MAIN is het live thema; de rest is onuitgegeven. */
  rol: string;
  bijgewerkt: string | null;
  /** Staat het Experli-snippet erin? Null als het niet te bepalen was. */
  snippet: boolean | null;
};

export type TemplateInfo = {
  /** Het deel achter de punt: product.new-design.json -> new-design */
  suffix: string;
  /** json (theme editor) of liquid (code) - puur ter info in het scherm. */
  soort: string;
};

const THEMA_QUERY = `#graphql
  query ExperliThemes {
    themes(first: 100, roles: [MAIN, UNPUBLISHED]) {
      nodes { id name role updatedAt }
    }
  }`;

const BESTANDEN_QUERY = `#graphql
  query ExperliThemeFiles($id: ID!, $patronen: [String!]) {
    theme(id: $id) {
      files(first: 250, filenames: $patronen) {
        nodes {
          filename
          body { ... on OnlineStoreThemeFileBodyText { content } }
        }
      }
    }
  }`;

export const themaNummer = (gid: string): number =>
  parseInt(String(gid).split("/").pop() || "", 10);

/**
 * Alle thema's waar een test op kan draaien.
 *
 * Gearchiveerde en demo-thema's blijven eruit: die kun je niet previewen, dus
 * ze aanbieden zou een test opleveren die nooit iets doet.
 */
export async function themaLijst(admin: any): Promise<ThemaInfo[]> {
  try {
    const res = await admin.graphql(THEMA_QUERY);
    const j = await res.json();
    const nodes = j?.data?.themes?.nodes;
    if (!Array.isArray(nodes)) return [];

    return nodes
      .map((t: any) => ({
        id: String(t.id),
        num: themaNummer(t.id),
        naam: String(t.name || "(zonder naam)"),
        rol: String(t.role || ""),
        bijgewerkt: t.updatedAt ? String(t.updatedAt) : null,
        snippet: null as boolean | null,
      }))
      .filter((t: ThemaInfo) => Number.isFinite(t.num))
      // Live thema bovenaan, daarna het meest recent bewerkte.
      .sort((a: ThemaInfo, b: ThemaInfo) => {
        if (a.rol !== b.rol) return a.rol === "MAIN" ? -1 : b.rol === "MAIN" ? 1 : 0;
        return String(b.bijgewerkt || "").localeCompare(String(a.bijgewerkt || ""));
      });
  } catch {
    return [];
  }
}

/**
 * De alternatieve producttemplates van een thema.
 *
 * product.json zelf valt af: dat is de standaardpagina die de controlegroep
 * toch al ziet, en hem als variant kiezen zou een test opleveren waarin beide
 * groepen precies hetzelfde krijgen.
 */
export async function productTemplates(admin: any, themaId: string): Promise<TemplateInfo[]> {
  try {
    const res = await admin.graphql(BESTANDEN_QUERY, {
      variables: { id: themaId, patronen: ["templates/product*"] },
    });
    const j = await res.json();
    const nodes = j?.data?.theme?.files?.nodes;
    if (!Array.isArray(nodes)) return [];

    const uit: TemplateInfo[] = [];
    for (const n of nodes) {
      // templates/product.new-design.json -> ["product", "new-design", "json"]
      const naam = String(n?.filename || "").replace(/^templates\//, "");
      const delen = naam.split(".");
      if (delen.length < 3 || delen[0] !== "product") continue;
      const soort = delen[delen.length - 1];
      const suffix = delen.slice(1, -1).join(".");
      if (!suffix) continue;
      uit.push({ suffix, soort });
    }
    return uit.sort((a, b) => a.suffix.localeCompare(b.suffix));
  } catch {
    return [];
  }
}

/**
 * Staat het Experli-snippet in dit thema?
 *
 * Dit is de controle die een thema-test van een stille mislukking scheidt.
 * Zonder het snippet meet de testgroep niets en stuurt hij ook niemand terug:
 * het dashboard laat dan een test zien met verkeer aan één kant, wat leest als
 * "de variant converteert nul" terwijl er alleen niets gemeten wordt.
 *
 * Null betekent "niet kunnen bepalen" (meestal: scope ontbreekt) en is bewust
 * iets anders dan false, zodat het scherm geen alarm slaat op onwetendheid.
 */
export async function snippetInThema(admin: any, themaId: string): Promise<boolean | null> {
  try {
    const res = await admin.graphql(BESTANDEN_QUERY, {
      variables: { id: themaId, patronen: ["snippets/price-test.liquid", "layout/theme.liquid"] },
    });
    const j = await res.json();
    const nodes = j?.data?.theme?.files?.nodes;
    if (!Array.isArray(nodes) || !nodes.length) return null;

    const bestand = (naam: string) =>
      String(nodes.find((n: any) => n?.filename === naam)?.body?.content || "");

    const snippet = bestand("snippets/price-test.liquid");
    const layout = bestand("layout/theme.liquid");

    // Beide moeten kloppen: het snippet moet bestaan én ergens gerenderd
    // worden. Een snippet dat er wel staat maar nergens wordt aangeroepen is
    // precies zo stil als een snippet dat ontbreekt.
    const heeftSnippet = snippet.includes("/api/price-test");
    const wordtGerenderd = /render\s+'price-test'|render\s+"price-test"/.test(layout);
    return heeftSnippet && wordtGerenderd;
  } catch {
    return null;
  }
}

/** Thema's mét de snippetcontrole erbij. Aparte call per thema, dus alleen
 *  gebruiken waar het ertoe doet - niet op elke dashboardpagina. */
export async function themaLijstMetSnippet(admin: any): Promise<ThemaInfo[]> {
  const lijst = await themaLijst(admin);
  const uit = await Promise.all(
    lijst.map(async (t) => ({ ...t, snippet: await snippetInThema(admin, t.id) })),
  );
  return uit;
}
