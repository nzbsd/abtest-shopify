import type { ProductInfo } from "./variants";

/**
 * Checks that run before a test is allowed to start.
 *
 * This exists because of a real incident: a test went live where the duplicate
 * had the same price, no selling plan, and was missing from the bundle config.
 * Half the product traffic was being sent to a page where visitors could not
 * subscribe and got no free gift, at an identical price. That is not a test
 * that measures nothing — it actively costs money for as long as it runs.
 *
 * The setup screen warned about all three in prose. Prose is not a check.
 *
 * Blocking versus warning: anything that makes the comparison meaningless or
 * costs money blocks. Anything that is merely unusual warns.
 */

export type Bevinding = {
  niveau: "block" | "warn";
  titel: string;
  uitleg: string;
};

export type PreflightInput = {
  control: ProductInfo;
  test: ProductInfo;
  /** Number of selling plan groups per product, from Shopify. */
  controlSellingPlans: number;
  testSellingPlans: number;
  /**
   * Numeric product ids present in the bundle configuration, or null when that
   * configuration could not be reached. Null means "cannot check" and produces
   * a warning rather than a false all-clear.
   */
  bundleProductIds: string[] | null;
};

const num = (gid: string) => String(gid).split("/").pop() || "";

export function preflight(input: PreflightInput): Bevinding[] {
  const { control, test, controlSellingPlans, testSellingPlans, bundleProductIds } = input;
  const out: Bevinding[] = [];

  /* ── price ──────────────────────────────────────────────────────────── */
  const priceOf = (p: ProductInfo) =>
    p.variants.map((v) => parseFloat(v.price) || 0).sort((a, b) => a - b);

  const cp = priceOf(control);
  const tp = priceOf(test);
  const samePrices =
    cp.length === tp.length && cp.every((v, i) => Math.abs(v - tp[i]) < 0.005);

  if (samePrices) {
    out.push({
      niveau: "block",
      titel: "Both products have the same price",
      uitleg:
        "There is nothing to measure. Set the price you want to test on the duplicate first.",
    });
  }

  /* ── selling plans ──────────────────────────────────────────────────── */
  if (controlSellingPlans > 0 && testSellingPlans === 0) {
    out.push({
      niveau: "block",
      titel: "The duplicate has no selling plan",
      uitleg:
        "The original offers a subscription and the duplicate does not, so the test group cannot subscribe at all. " +
        "You would be measuring that, not the price. Attach the duplicate to the same selling plan group.",
    });
  } else if (controlSellingPlans !== testSellingPlans) {
    out.push({
      niveau: "warn",
      titel: "The two products have a different number of selling plan groups",
      uitleg:
        "Control has " + controlSellingPlans + ", duplicate has " + testSellingPlans +
        ". Check that both offer the same subscription options.",
    });
  }

  /* ── bundle configuration ───────────────────────────────────────────── */
  if (bundleProductIds === null) {
    out.push({
      niveau: "warn",
      titel: "Bundle configuration could not be checked",
      uitleg:
        "Verify by hand that the duplicate is in the bundle config with the same tiers, otherwise the " +
        "test group misses the free item.",
    });
  } else {
    const controlInBundle = bundleProductIds.includes(num(control.id));
    const testInBundle = bundleProductIds.includes(num(test.id));
    if (controlInBundle && !testInBundle) {
      out.push({
        niveau: "block",
        titel: "The duplicate is missing from the bundle configuration",
        uitleg:
          "The original gives a free item through the bundle and the duplicate does not. The test group would " +
          "get less for their money, which has nothing to do with the price being tested. Add product " +
          num(test.id) + " to the bundle config with the same tiers.",
      });
    }
  }

  /* ── variants ───────────────────────────────────────────────────────── */
  if (control.variants.length !== test.variants.length) {
    out.push({
      niveau: "warn",
      titel: "The products have a different number of variants",
      uitleg:
        "Control has " + control.variants.length + ", duplicate has " + test.variants.length +
        ". Variants that cannot be matched fall outside the test.",
    });
  }

  /* ── visibility ─────────────────────────────────────────────────────── */
  if (test.status && test.status.toUpperCase() === "DRAFT") {
    out.push({
      niveau: "block",
      titel: "The duplicate is a draft",
      uitleg: "Visitors sent there would hit a page that is not published. Set it to unlisted.",
    });
  } else if (test.status && test.status.toUpperCase() === "ACTIVE") {
    out.push({
      niveau: "warn",
      titel: "The duplicate is active rather than unlisted",
      uitleg:
        "It will show up in search and collections next to the original, and can be indexed by Google. " +
        "Unlisted keeps it reachable by URL only, which is what a test duplicate wants to be.",
    });
  }

  return out;
}

/**
 * Product ids in the bundle configuration of the other app.
 *
 * Deliberately over an env-configured URL and not hard-wired: this app should
 * not carry a fixed dependency on another deployment. No URL configured means
 * the check is skipped with a warning rather than silently passing.
 */
export async function bundleProductIds(): Promise<string[] | null> {
  const base = process.env.BUNDLE_CONFIG_URL;
  const shop = process.env.SHOP_DOMAIN;
  if (!base || !shop) return null;

  try {
    const res = await fetch(base + "?shop=" + encodeURIComponent(shop), {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    if (!Array.isArray(data?.products)) return null;
    return data.products.map((p: any) => String(p.id));
  } catch {
    // Unreachable is not the same as "everything is fine": null makes the
    // caller warn instead of giving an all-clear it cannot back up.
    return null;
  }
}
