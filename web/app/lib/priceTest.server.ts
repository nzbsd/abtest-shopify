import supabase from "~/db.server";

/**
 * Prijstest op basis van twee echte producten.
 *
 * Het origineel is de controlegroep, een duplicaat met een hogere prijs is de
 * testgroep. Deze module wijzigt GEEN prijzen: dat doe je zelf in Shopify op
 * het duplicaat. Hier wordt alleen vastgelegd welke twee producten bij elkaar
 * horen en welke variant met welke correspondeert.
 *
 * Dat het hier geen prijzen bijhoudt is opzet. Zou de app een prijs opslaan,
 * dan kan die gaan afwijken van wat er in Shopify staat en toont het thema een
 * bedrag dat de kassa niet rekent. Nu haalt het thema de prijs live op bij
 * Shopify zelf, en klopt hij per definitie - ook per markt en per valuta.
 */

export type VariantPair = {
  control_num: number; // numeriek variant-id van het origineel
  test_num: number;    // numeriek variant-id van het duplicaat
  title: string;       // variantnaam, puur voor het overzicht in de admin
};

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
};

export type ProductInfo = {
  id: string;
  handle: string;
  title: string;
  variants: { id: string; num: number; title: string; price: string }[];
};

function numOf(gid: string): number {
  return parseInt(String(gid).split("/").pop() || "", 10);
}

/** Product met varianten ophalen; gebruikt om de twee kanten te koppelen. */
export async function fetchProduct(admin: any, productId: string): Promise<ProductInfo | null> {
  const res: any = await admin.graphql(
    `#graphql
     query Prod($id: ID!) {
       product(id: $id) {
         id handle title
         variants(first: 100) { nodes { id title price } }
       }
     }`,
    { variables: { id: productId } },
  );
  const j = await res.json();
  const p = j?.data?.product;
  if (!p) return null;
  return {
    id: p.id,
    handle: p.handle,
    title: p.title,
    variants: (p.variants?.nodes || []).map((v: any) => ({
      id: v.id,
      num: numOf(v.id),
      title: v.title,
      price: v.price,
    })),
  };
}

/**
 * Product opzoeken op wat je ook maar invult: numeriek id, gid, handle of de
 * volledige URL van de productpagina. Dat scheelt heen-en-weer met de admin om
 * het juiste id te vinden, en een verkeerd overgetypt id is precies het soort
 * fout dat je pas merkt als de test al draait.
 */
export async function resolveProduct(admin: any, invoer: string): Promise<ProductInfo | null> {
  const s = invoer.trim();
  if (!s) return null;

  if (/^\d+$/.test(s)) return fetchProduct(admin, "gid://shopify/Product/" + s);
  if (s.startsWith("gid://shopify/Product/")) return fetchProduct(admin, s);

  // Handle uit een URL vissen: /products/<handle> met eventueel ?variant=...
  const m = s.match(/\/products\/([^/?#]+)/);
  const handle = (m ? m[1] : s).trim().toLowerCase();

  const res: any = await admin.graphql(
    `#graphql
     query ByHandle($h: String!) {
       products(first: 1, query: $h) {
         nodes {
           id handle title
           variants(first: 100) { nodes { id title price } }
         }
       }
     }`,
    { variables: { h: "handle:" + handle } },
  );
  const j = await res.json();
  const p = j?.data?.products?.nodes?.[0];
  if (!p || p.handle !== handle) return null;
  return {
    id: p.id,
    handle: p.handle,
    title: p.title,
    variants: (p.variants?.nodes || []).map((v: any) => ({
      id: v.id,
      num: numOf(v.id),
      title: v.title,
      price: v.price,
    })),
  };
}

/**
 * Varianten van origineel en duplicaat aan elkaar knopen op varianttitel.
 *
 * Een duplicaat heeft dezelfde optienamen, dus titels matchen normaal
 * één-op-één. Lukt een titel niet, dan valt hij terug op dezelfde POSITIE.
 * Blijft er dan nog iets over, dan wordt die variant NIET gekoppeld: liever
 * een variant die buiten de test valt dan een bezoeker die "6 flessen" kiest
 * en "1 fles" in zijn cart krijgt.
 */
export function matchVariants(control: ProductInfo, test: ProductInfo): {
  pairs: VariantPair[];
  unmatched: string[];
} {
  const pairs: VariantPair[] = [];
  const unmatched: string[] = [];
  const gebruikt = new Set<number>();

  control.variants.forEach((cv, i) => {
    const opTitel = test.variants.find(
      (tv) => tv.title.trim().toLowerCase() === cv.title.trim().toLowerCase() && !gebruikt.has(tv.num),
    );
    const kandidaat =
      opTitel ||
      (test.variants[i] && !gebruikt.has(test.variants[i].num) ? test.variants[i] : undefined);

    if (!kandidaat) {
      unmatched.push(cv.title);
      return;
    }
    gebruikt.add(kandidaat.num);
    pairs.push({ control_num: cv.num, test_num: kandidaat.num, title: cv.title });
  });

  return { pairs, unmatched };
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
