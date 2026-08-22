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
  control_product_id: string;
  control_title: string | null;
  test_product_id: string;
  test_product_handle: string;
  test_title: string | null;
  variant_map: VariantPair[];
  status: "draft" | "running" | "stopped";
  split_pct: number;
  started_at: string | null;
  stopped_at: string | null;
  created_at?: string;
};

function numOf(gid: string): number {
  return parseInt(String(gid).split("/").pop() || "", 10);
}

const PRODUCT_VELDEN = `
  id handle title status
  onlineStoreUrl
  onlineStorePreviewUrl
  featuredImage { url }
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
