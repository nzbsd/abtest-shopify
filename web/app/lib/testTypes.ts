/**
 * The kinds of test this app can run.
 *
 * The machinery underneath is the same for all of them: assign a visitor to a
 * group, write that group into the cart, attribute orders by that tag. None of
 * that is price-specific. What differs is only what the test group is shown,
 * so the type sits beside the test rather than in a separate table.
 *
 * Deliberately not a fourth "custom" type. Every option here is something the
 * theme can do without knowing what the test is about; the moment a test needs
 * bespoke theme code it stops being configuration and becomes a deploy.
 */

export type TestType = "price" | "template" | "url";

export type TypeInfo = {
  key: TestType;
  naam: string;
  kort: string;
  uitleg: string;
  /** What you have to prepare in Shopify before this can run. */
  voorbereiding: string;
  /** Where the visitor ends up, in one line. */
  mechaniek: string;
};

export const TYPES: TypeInfo[] = [
  {
    key: "price",
    naam: "Price",
    kort: "Same product, different price",
    uitleg:
      "Half the visitors are sent to a duplicate of the product that carries a different price. " +
      "Because it is a real product, everything downstream is real too: quantity tiers, " +
      "subscription options, currency per market, and the checkout total.",
    voorbereiding:
      "Duplicate the product in Shopify, set the new price on it, and attach the same bundle, " +
      "selling plan and reviews. Keep it unlisted.",
    mechaniek: "Test group goes to the duplicate's URL.",
  },
  {
    key: "template",
    naam: "Page design",
    kort: "Same product, different template",
    uitleg:
      "Both groups buy the same product at the same price; only the page differs. Use this for " +
      "layout, images, copy, or a different set of blocks. Nothing is duplicated, so there is " +
      "nothing to keep in sync afterwards.",
    voorbereiding:
      "Create an alternate product template in your theme, for example product.new-design. " +
      "The part after the dot is what you enter here.",
    mechaniek: "Test group gets ?view=<suffix> on the same URL.",
  },
  {
    key: "url",
    naam: "Page versus page",
    kort: "Two URLs against each other",
    uitleg:
      "Any page against any other page — two landing pages, two collections, a long page against " +
      "a short one. The broadest option, and the one where you have to be most careful that the " +
      "two pages really are comparable.",
    voorbereiding:
      "Both pages have to exist and be reachable. Keep the variant out of your navigation so it " +
      "only gets traffic from this test.",
    mechaniek: "Test group is sent from the first URL to the second.",
  },
];

export function typeInfo(t: string | null | undefined): TypeInfo {
  return TYPES.find((x) => x.key === t) ?? TYPES[0];
}

/**
 * Is this test set up completely enough to run?
 *
 * Returns the reason it is not, so the screen can say what is missing rather
 * than greying out a button without explanation.
 */
export function watOntbreekt(t: {
  test_type?: string | null;
  control_product_id?: string | null;
  test_product_id?: string | null;
  template_suffix?: string | null;
  control_url?: string | null;
  test_url?: string | null;
}): string | null {
  switch (t.test_type ?? "price") {
    case "price":
      if (!t.control_product_id) return "No original product chosen.";
      if (!t.test_product_id) return "No duplicate chosen.";
      return null;
    case "template":
      if (!t.control_product_id) return "No product chosen.";
      if (!t.template_suffix) return "No template suffix entered.";
      return null;
    case "url":
      if (!t.control_url) return "No original URL entered.";
      if (!t.test_url) return "No variant URL entered.";
      if (t.control_url === t.test_url) return "Both URLs are the same.";
      return null;
    default:
      return "Unknown test type.";
  }
}

/** A path within this store, without host, query or hash. */
export function normaliseerPad(invoer: string): string {
  const s = invoer.trim();
  if (!s) return "";
  try {
    // Accepts a full URL as well as a bare path, because people paste both.
    const u = s.startsWith("http") ? new URL(s) : new URL(s, "https://x.invalid");
    return u.pathname.replace(/\/+$/, "") || "/";
  } catch {
    return s.startsWith("/") ? s.replace(/\/+$/, "") : "/" + s.replace(/\/+$/, "");
  }
}
