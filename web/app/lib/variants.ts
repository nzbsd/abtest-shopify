/**
 * Varianten koppelen tussen origineel en duplicaat.
 *
 * Bewust géén .server-bestand: het instelscherm laat de koppeling zien terwijl
 * je nog aan het kiezen bent, en de server slaat hem op. Twee kopieën van deze
 * logica zouden betekenen dat het scherm iets anders toont dan er wordt
 * bewaard - precies de fout die je pas ontdekt als een klant de verkeerde
 * variant in zijn cart krijgt.
 */

export type VariantPair = {
  control_num: number; // numeriek variant-id van het origineel
  test_num: number;    // numeriek variant-id van het duplicaat
  title: string;       // variantnaam, voor het overzicht
};

export type VariantInfo = { id: string; num: number; title: string; price: string };

export type ProductInfo = {
  id: string;
  handle: string;
  title: string;
  image?: string | null;
  /** ACTIVE, DRAFT or UNLISTED - shown in the picker so two products with the
      same title can be told apart. */
  status?: string;
  /** Storefront URL. Unlisted and draft products have a preview URL instead of
      a public one, so both are asked for and whichever exists is used. */
  url?: string | null;
  /** Number of selling plan groups. Used by the pre-flight check: a duplicate
      without one means the test group cannot subscribe at all. */
  sellingPlanGroups?: number;
  /** Het template waar dit product nu op staat, zonder "product." ervoor.
      Leeg betekent het standaardtemplate (product.json). Dit is de
      controlekant van een page design-test: wat bezoekers vandaag zien. */
  templateSuffix?: string | null;
  variants: VariantInfo[];
};

/**
 * Koppelen op varianttitel, met positie als terugval.
 *
 * Een duplicaat heeft dezelfde optienamen, dus titels matchen normaal
 * één-op-één. Lukt dat niet, dan valt hij terug op dezelfde POSITIE. Blijft er
 * daarna nog iets over, dan wordt die variant NIET gekoppeld: liever een
 * variant die buiten de test valt dan een bezoeker die "6 flessen" kiest en
 * "1 fles" in zijn cart krijgt.
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
      opTitel || (test.variants[i] && !gebruikt.has(test.variants[i].num) ? test.variants[i] : undefined);

    if (!kandidaat) {
      unmatched.push(cv.title);
      return;
    }
    gebruikt.add(kandidaat.num);
    pairs.push({ control_num: cv.num, test_num: kandidaat.num, title: cv.title });
  });

  return { pairs, unmatched };
}

/** Prijsvergelijking per gekoppelde variant, voor het instelscherm. */
export function prijsVergelijking(control: ProductInfo, test: ProductInfo, pairs: VariantPair[]) {
  return pairs.map((p) => {
    const cv = control.variants.find((v) => v.num === p.control_num);
    const tv = test.variants.find((v) => v.num === p.test_num);
    const oud = parseFloat(cv?.price || "0");
    const nieuw = parseFloat(tv?.price || "0");
    return {
      titel: p.title,
      oud,
      nieuw,
      verschil: nieuw - oud,
      procent: oud > 0 ? ((nieuw - oud) / oud) * 100 : 0,
    };
  });
}
