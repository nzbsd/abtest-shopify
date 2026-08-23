import type { OrderCijfers } from "./orders.server";

/**
 * What a price does over a customer's lifetime, not just on the first order.
 *
 * A price test measures the first purchase. For a subscription that is the
 * smaller half of the answer: a customer who pays more per cycle is worth more
 * every cycle, so a price that loses a little conversion can still win by a
 * distance — or lose badly if the higher price also shortens how long people
 * stay.
 *
 * Everything here rests on an assumption you supply: how many billing cycles an
 * average customer lasts. That cannot be measured inside a two-week test, so it
 * is treated as an assumption everywhere and never presented as a finding.
 *
 * The number worth looking at is not the projection. It is the BREAK-EVEN: how
 * few cycles the test group could survive and still match the control group.
 * If that number sits well below what you already know your customers do, the
 * higher price is safe even if it costs you some retention. That turns "we
 * cannot know yet" into something you can actually decide on.
 */

export type LtvInvoer = {
  visitors: number;
  /** First-order figures for this group. */
  orders: OrderCijfers;
  /** Assumed billing cycles per customer, first order included. */
  cycles: number;
};

export type LtvGroep = {
  visitors: number;
  orders: number;
  /** Share of orders on a selling plan, 0-1. */
  subAandeel: number;
  /** Average first-order value. */
  aov: number;
  /** Expected revenue per customer across their lifetime. */
  ltvPerKlant: number;
  /** The same, spread over every visitor — the number to compare on. */
  ltvPerBezoeker: number;
  /** First-order revenue per visitor, for reference. */
  eersteOrderPerBezoeker: number;
};

export function ltvGroep({ visitors, orders, cycles }: LtvInvoer): LtvGroep {
  const n = orders.orders;
  const aov = n ? orders.revenueCents / 100 / n : 0;
  const subAandeel = n ? orders.subOrders / n : 0;

  // One-off buyers are worth one order; subscribers are worth `cycles` of them.
  // Blending by the observed subscription share keeps a shift in that mix
  // visible instead of assuming everyone subscribes.
  const factor = subAandeel * Math.max(cycles, 1) + (1 - subAandeel);

  const ltvPerKlant = aov * factor;
  const cr = visitors ? n / visitors : 0;

  return {
    visitors,
    orders: n,
    subAandeel,
    aov,
    ltvPerKlant,
    ltvPerBezoeker: cr * ltvPerKlant,
    eersteOrderPerBezoeker: visitors ? orders.revenueCents / 100 / visitors : 0,
  };
}

export type Forecast = {
  control: LtvGroep;
  test: LtvGroep;
  /** Difference in lifetime value per visitor, in currency. */
  verschilPerBezoeker: number;
  /** The same as a percentage. */
  verschilPct: number;
  /**
   * How many cycles the test group would need to average for the two to come
   * out equal. Below this the higher price is behind; above it, ahead.
   * Null when it cannot be computed - no subscribers, or no control revenue.
   */
  omslagCycles: number | null;
  /**
   * How much retention the test group can lose before it stops paying off,
   * as a percentage of the assumed lifetime. Negative means it is already
   * behind even at equal retention.
   */
  margeOpRetentie: number | null;
};

export function forecast(
  controleInvoer: LtvInvoer,
  testInvoer: LtvInvoer,
): Forecast {
  const c = ltvGroep(controleInvoer);
  const t = ltvGroep(testInvoer);

  const verschilPerBezoeker = t.ltvPerBezoeker - c.ltvPerBezoeker;
  const verschilPct = c.ltvPerBezoeker > 0
    ? (verschilPerBezoeker / c.ltvPerBezoeker) * 100
    : 0;

  /*
   * Break-even. Setting the two lifetime values per visitor equal:
   *
   *   CRt · AOVt · (St·L + (1−St))  =  CRc · AOVc · (Sc·Lc + (1−Sc))
   *
   * and solving for L. Without subscribers on the test side (St = 0) the left
   * hand side does not depend on L at all, so there is no break-even to find.
   */
  let omslagCycles: number | null = null;
  const crT = t.visitors ? t.orders / t.visitors : 0;
  if (t.subAandeel > 0 && crT > 0 && t.aov > 0) {
    const doel = c.ltvPerBezoeker / (crT * t.aov);      // = St·L + (1−St)
    const L = (doel - (1 - t.subAandeel)) / t.subAandeel;
    if (isFinite(L) && L > 0) omslagCycles = L;
  }

  const aangenomen = Math.max(testInvoer.cycles, 1);
  const margeOpRetentie = omslagCycles !== null && aangenomen > 0
    ? ((aangenomen - omslagCycles) / aangenomen) * 100
    : null;

  return { control: c, test: t, verschilPerBezoeker, verschilPct, omslagCycles, margeOpRetentie };
}

/**
 * Plain-language read of the forecast.
 *
 * Deliberately hedged. This is arithmetic on an assumption, not a measurement,
 * and the wording should never let it be mistaken for one.
 */
export function forecastTekst(f: Forecast, aangenomenCycles: number): string {
  if (f.control.orders === 0 || f.test.orders === 0) {
    return "Not enough orders in both groups to project anything yet.";
  }

  const cyc = aangenomenCycles.toFixed(1);

  if (f.omslagCycles === null) {
    return (
      "No subscription orders in the test group, so there is no lifetime to project — " +
      "the first-order numbers are the whole story here."
    );
  }

  const omslag = f.omslagCycles.toFixed(1);

  if (f.margeOpRetentie !== null && f.margeOpRetentie > 0) {
    return (
      "At an assumed " + cyc + " cycles the test price is ahead. It stays ahead as long as those " +
      "customers average more than " + omslag + " cycles — so retention could drop by " +
      f.margeOpRetentie.toFixed(0) + "% before the higher price stops paying off."
    );
  }

  return (
    "At an assumed " + cyc + " cycles the test price is behind. It would need customers to average " +
    omslag + " cycles to break even, which is more than the assumption — so it only works if the " +
    "higher price also keeps people longer."
  );
}
