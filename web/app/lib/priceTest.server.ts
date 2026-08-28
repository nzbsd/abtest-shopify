import supabase from "~/db.server";
import type { ProductInfo, VariantPair } from "./variants";

export type { ProductInfo, VariantPair };
export { matchVariants, prijsVergelijking } from "./variants";

/**
 * Prijstest op basis van twee echte producten.
 *
 * Het origineel is de controlegroep, een duplicaat met een andere prijs de
 * testgroep. Deze module wijzigt GEEN prijzen: dat doe je zelf in Shopify op
 * het duplicaat. Hier wordt alleen vastgelegd welke twee producten bij elkaar
 * horen en welke variant met welke correspondeert.
 *
 * Dat er geen prijzen worden opgeslagen is opzet. Zou de app een prijs bewaren,
 * dan kan die gaan afwijken van wat in Shopify staat en toont het thema een
 * bedrag dat de kassa niet rekent. Nu haalt het thema de prijs live bij Shopify
 * op, en klopt hij per definitie - ook per markt en per valuta.
 */

export type PriceTest = {
  id: number;
  shop: string;
  /** price | template | url | theme - zie testTypes.ts */
  test_type: "price" | "image" | "template" | "url" | "checkout" | "theme";
  /** Vrije naam, want het product zegt niets als er drie tests op draaien. */
  naam: string | null;
  hypothese: string | null;
  /** Alleen bij een template-test: het deel achter ?view= */
  template_suffix: string | null;
  /** Alleen bij een afbeeldingstest: welke foto (1-based) de testgroep eerst ziet. */
  image_positie: number | null;
  /* Welke mechaniek de kassatest gebruikt, en hoe hij ingesteld staat. Zie
     migratie 0022 voor waarom dat een jsonb is en geen rij kolommen. */
  checkout_variant: string | null;
  checkout_config: Record<string, any> | null;
  /* De delivery customization in Shopify, bij een verzendtest. */
  checkout_customization_id: string | null;
  /** Alleen bij een url-test. */
  control_url: string | null;
  test_url: string | null;
  /** Alleen bij een thema-test: het onuitgegeven thema voor de testgroep. */
  test_theme_id: string | null;
  test_theme_name: string | null;
  /** Leeg bij een thema-test - die hangt aan geen enkel product. */
  control_product_id: string | null;
  control_product_handle: string | null;
  control_title: string | null;
  test_product_id: string | null;
  test_product_handle: string | null;
  test_title: string | null;
  variant_map: VariantPair[];
  status: "draft" | "running" | "stopped";
  split_pct: number;
  started_at: string | null;
  stopped_at: string | null;
  /** Waarop de uitslag gelezen wordt - zie lib/metrics.ts. */
  primary_metric: "rpv" | "cvr" | "aov" | "sub_rate" | "atc";
  /** Metrieken die niet mogen verslechteren, ook al wint de hoofdmetriek. */
  guardrails: string[];
  confidence_pct: number;
  /** Kleinste lift die het waard is om te vinden, in procenten. */
  mde_pct: number | null;
  /** Leeg = iedereen. */
  target_devices: string[];
  target_countries: string[];
  /** Wat je besloot toen de test stopte. */
  besluit: "uitrollen" | "verwerpen" | "onbeslist" | "opnieuw" | null;
  besluit_notitie: string | null;
  besluit_at: string | null;
  /** Abonnementsproduct? Zet de LTV-voorspelling aan. */
  is_subscription: boolean;
  /** Aanname: gemiddeld aantal facturatiecycli per klant, eerste order inbegrepen. */
  avg_cycles: number | null;
  avg_cycles_test: number | null;
  created_at?: string;
};

function numOf(gid: string): number {
  return parseInt(String(gid).split("/").pop() || "", 10);
}

const PRODUCT_VELDEN = `
  id handle title status templateSuffix
  sellingPlanGroupCount
  onlineStoreUrl
  onlineStorePreviewUrl
  featuredImage { url }
  # De galerij, voor de afbeeldingstest: je moet kunnen zien welke foto je
  # kiest, en hoeveel er zijn. Twintig is ruim - meer foto's op een
  # productpagina komt zelden voor en zou de kiezer onleesbaar maken.
  #
  # En met een hekje, niet met /* */. GraphQL kent dat tweede niet: de hele
  # query werd er ongeldig van, elke productquery gaf een fout terug, en het
  # scherm meldde doodleuk "No products found" - want een lege lijst en een
  # kapotte query zien er van buiten precies hetzelfde uit.
  media(first: 20) {
    nodes {
      ... on MediaImage { id image { url altText } }
    }
  }
  variants(first: 100) { nodes { id title price } }
`;

function naarProductInfo(p: any): ProductInfo {
  return {
    id: p.id,
    handle: p.handle,
    title: p.title,
    image: p.featuredImage?.url ?? null,
    status: p.status,
    url: p.onlineStoreUrl || p.onlineStorePreviewUrl || null,
    sellingPlanGroups: Number(p.sellingPlanGroupCount) || 0,
    templateSuffix: p.templateSuffix || null,
    media: (p.media?.nodes || [])
      .filter((m: any) => m?.image?.url)
      .map((m: any, i: number) => ({
        pos: i + 1,
        url: m.image.url as string,
        alt: (m.image.altText as string) || null,
      })),
    variants: (p.variants?.nodes || []).map((v: any) => ({
      id: v.id,
      num: numOf(v.id),
      title: v.title,
      price: v.price,
    })),
  };
}

/** Product met varianten ophalen. */
export async function fetchProduct(admin: any, productId: string): Promise<ProductInfo | null> {
  const res: any = await admin.graphql(
    `#graphql
     query Prod($id: ID!) { product(id: $id) { ${PRODUCT_VELDEN} } }`,
    { variables: { id: productId } },
  );
  const j = await res.json();
  return j?.data?.product ? naarProductInfo(j.data.product) : null;
}

/**
 * Producten voor de kiezer.
 *
 * Inclusief varianten en prijzen, zodat het instelscherm de koppeling en het
 * prijsverschil kan tonen zonder voor elke klik terug te hoeven naar de server.
 * Beperkt tot actieve producten: een test opzetten op een gearchiveerd product
 * levert alleen verwarring op.
 */
export async function lijstProducten(admin: any, zoek = ""): Promise<ProductInfo[]> {
  // Alleen gearchiveerde producten vallen af.
  //
  // Niet filteren op status:active, hoe verleidelijk dat ook is: unlisted
  // producten hebben in Shopify de status UNLISTED, en die valt buiten
  // "active" én buiten "draft". Op deze winkel staan de meeste producten op
  // unlisted - inclusief bijna elke Oregano-variant - dus zo'n filter maakt de
  // lijst vrijwel leeg. Gecontroleerd tegen de live winkel: "-status:archived"
  // geeft ACTIVE en UNLISTED, "status:active" laat UNLISTED weg.
  //
  // Unlisted is bovendien precies wat een duplicaat hoort te zijn: bereikbaar
  // via zijn URL, onzichtbaar in zoekresultaten en collecties.
  const filter = ["-status:archived", zoek.trim() ? `title:*${zoek.trim()}*` : ""]
    .filter(Boolean)
    .join(" AND ");

  const res: any = await admin.graphql(
    `#graphql
     query Producten($q: String!) {
       products(first: 60, query: $q, sortKey: UPDATED_AT, reverse: true) {
         nodes { ${PRODUCT_VELDEN} }
       }
     }`,
    { variables: { q: filter } },
  );
  const j = await res.json();
  return (j?.data?.products?.nodes || []).map(naarProductInfo);
}

/**
 * Product opzoeken op wat je ook maar invult: numeriek id, gid, handle of de
 * volledige URL van de productpagina. Een verkeerd overgetypt id is precies het
 * soort fout dat je pas merkt als de test al draait.
 */
export async function resolveProduct(admin: any, invoer: string): Promise<ProductInfo | null> {
  const s = invoer.trim();
  if (!s) return null;

  if (/^\d+$/.test(s)) return fetchProduct(admin, "gid://shopify/Product/" + s);
  if (s.startsWith("gid://shopify/Product/")) return fetchProduct(admin, s);

  const m = s.match(/\/products\/([^/?#]+)/);
  const handle = (m ? m[1] : s).trim().toLowerCase();

  const res: any = await admin.graphql(
    `#graphql
     query ByHandle($h: String!) {
       products(first: 1, query: $h) { nodes { ${PRODUCT_VELDEN} } }
     }`,
    { variables: { h: "handle:" + handle } },
  );
  const j = await res.json();
  const p = j?.data?.products?.nodes?.[0];
  return p && p.handle === handle ? naarProductInfo(p) : null;
}

export async function loadTests(shop: string): Promise<PriceTest[]> {
  const { data, error } = await supabase
    .from("price_tests")
    .select("*")
    .eq("shop", shop)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as PriceTest[];
}
