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

export type TestType = "price" | "image" | "template" | "url" | "checkout" | "theme";

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
    key: "image",
    naam: "Product images",
    kort: "Same page, a different photo first",
    uitleg:
      "The test group sees a different photo as the first one in the gallery. Nothing else " +
      "changes — same page, same price, same copy — so whatever moves is down to that one image. " +
      "It is the narrowest test in this list, and that is exactly what makes it easy to learn " +
      "from: when it wins, you know why.",
    voorbereiding:
      "Nothing to build. Every photo is already on the product; you only pick which one the test " +
      "group opens on. Worth checking that the photo works as a first impression on its own — a " +
      "detail shot that made sense as number four can be confusing as number one.",
    mechaniek: "Test group gets that photo moved to the front of the gallery.",
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
      "Pick one of the alternate product templates already in your theme. If you want a new one, " +
      "duplicate a template in the theme editor first — it will show up in the list.",
    mechaniek: "Test group gets ?view=<suffix> on the same URL.",
  },
  {
    key: "checkout",
    naam: "Checkout",
    kort: "A message in the checkout, for one group",
    uitleg:
      "The test group sees an extra block in the checkout — reassurance about shipping, a " +
      "returns promise, a note about the guarantee. Everything before the checkout is identical, " +
      "so this measures the one place most tests never reach: the gap between reaching the " +
      "checkout and finishing it.",
    voorbereiding:
      "The Experli block has to be placed once in the checkout editor, wherever you want the " +
      "message to appear. After that every checkout test uses that same spot — you do not touch " +
      "the editor again.",
    mechaniek: "Test group sees the block; the control group sees nothing there.",
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
  {
    key: "theme",
    naam: "Theme",
    kort: "A whole theme against the live one",
    uitleg:
      "The test group browses an unpublished theme — every page, not just one. Use this for a " +
      "redesign or a big structural change. It is the widest test there is, which also makes it " +
      "the hardest to learn from: when it wins you know that it wins, not why.",
    voorbereiding:
      "The unpublished theme needs the Experli snippet too, otherwise the test group is never " +
      "measured. Experli checks this before it lets you start.",
    mechaniek: "Test group is served the unpublished theme for the whole session.",
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
  test_theme_id?: string | null;
  image_positie?: number | null;
  checkout_variant?: string | null;
  checkout_config?: any;
}): string | null {
  switch (t.test_type ?? "price") {
    case "price":
      if (!t.control_product_id) return "No original product chosen.";
      if (!t.test_product_id) return "No duplicate chosen.";
      return null;
    case "image":
      if (!t.control_product_id) return "No product chosen.";
      if (!t.image_positie) return "No photo chosen for the test group.";
      return null;
    case "template":
      if (!t.control_product_id) return "No product chosen.";
      if (!t.template_suffix) return "No template suffix entered.";
      return null;
    case "checkout":
      if (!t.checkout_variant) return "No kind of checkout test chosen.";
      if (!t.checkout_config) return "Nothing configured yet.";
      return null;
    case "url":
      if (!t.control_url) return "No original URL entered.";
      if (!t.test_url) return "No variant URL entered.";
      if (t.control_url === t.test_url) return "Both URLs are the same.";
      return null;
    case "theme":
      if (!t.test_theme_id) return "No theme chosen.";
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
