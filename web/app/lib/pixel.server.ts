import supabase from "~/db.server";

/**
 * De web pixel aanzetten op een winkel.
 *
 * Een extensie bestaat pas als er ook een pixel van gemaakt is op de winkel
 * zelf - de extensie is de code, deze mutatie is de instantie. Zonder dit staat
 * hij netjes in de app en meet hij niets.
 *
 * EEN KEER, EN DAARNA ALLEEN ALS ER IETS VERANDERT
 * De mutatie is idempotent per winkel: bestaat er al een, dan krijg je een
 * fout die zegt dat hij bestaat. Maar de instellingen kunnen veranderen - het
 * eindpunt verhuist als de app-URL verandert - dus proberen we eerst bij te
 * werken en pas daarna aan te maken.
 *
 * De uitkomst wordt onthouden zodat dit niet bij elke paginaweergave opnieuw
 * langs Shopify gaat.
 */

type Uitkomst = "aangemaakt" | "bijgewerkt" | "stond-al-goed" | "mislukt";

const MAAK = `#graphql
  mutation ExperliPixelMaken($settings: JSON!) {
    webPixelCreate(webPixel: { settings: $settings }) {
      webPixel { id }
      userErrors { field message }
    }
  }`;

const WERK_BIJ = `#graphql
  mutation ExperliPixelBijwerken($id: ID!, $settings: JSON!) {
    webPixelUpdate(id: $id, webPixel: { settings: $settings }) {
      webPixel { id }
      userErrors { field message }
    }
  }`;

const LEES = `#graphql
  query ExperliPixel { webPixel { id settings } }`;

export async function zetPixelAan(admin: any, shop: string): Promise<Uitkomst> {
  const eindpunt = (process.env.SHOPIFY_APP_URL || "").replace(/\/+$/, "") + "/api/site";
  const settings = JSON.stringify({ endpoint: eindpunt, shop });

  try {
    // Niet vaker dan eens per dag langs Shopify. De pixel verandert alleen als
    // de app-URL verandert, en dat gebeurt bij een deploy - niet bij een klik.
    const { data: bekend } = await supabase
      .from("site_winkel").select("pixel_at, pixel_settings").eq("shop", shop).maybeSingle();
    const vers = bekend?.pixel_at &&
      Date.now() - new Date(bekend.pixel_at).getTime() < 86_400_000;
    if (vers && bekend?.pixel_settings === settings) return "stond-al-goed";

    const huidig = await admin.graphql(LEES).then((r: any) => r.json());
    const id = huidig?.data?.webPixel?.id ?? null;

    const antwoord = id
      ? await admin.graphql(WERK_BIJ, { variables: { id, settings } }).then((r: any) => r.json())
      : await admin.graphql(MAAK, { variables: { settings } }).then((r: any) => r.json());

    const fouten = antwoord?.data?.webPixelUpdate?.userErrors
      ?? antwoord?.data?.webPixelCreate?.userErrors ?? [];
    if (fouten.length) return "mislukt";

    await supabase.from("site_winkel").upsert(
      { shop, pixel_at: new Date().toISOString(), pixel_settings: settings },
      { onConflict: "shop" },
    );
    return id ? "bijgewerkt" : "aangemaakt";
  } catch {
    // Geen pixel betekent geen kassastappen. Dat is jammer, maar het is geen
    // reden om het scherm dat je net opende niet te tonen.
    return "mislukt";
  }
}
