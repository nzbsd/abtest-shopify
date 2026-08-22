import type { PriceTest } from "./priceTest.server";
import type { StatRij } from "./analytics";

/**
 * Is a running test actually reaching visitors?
 *
 * The signal is the absence of events. A test marked running for a while with
 * nothing measured has exactly one likely explanation: the theme is not running
 * the snippet. That happened here — a test sat on "running" for an hour while
 * the storefront knew nothing about it, and the dashboard cheerfully showed
 * zeroes as if that were a result.
 *
 * Deliberately inferred rather than reported. An explicit heartbeat from the
 * theme would need another theme edit and would tell us nothing extra: the
 * visitors are the heartbeat.
 */

/** Grace period before silence counts as a problem. */
const STIL_MS = 15 * 60 * 1000;

/** No event for this long while running means something broke after a good start. */
const STOKKEND_MS = 6 * 60 * 60 * 1000;

export type Gezondheid =
  | { status: "ok" }
  | { status: "wachten"; uitleg: string }
  | { status: "stil"; uitleg: string }
  | { status: "stokkend"; uitleg: string };

export function gezondheid(test: PriceTest, stats: StatRij[]): Gezondheid {
  if (test.status !== "running") return { status: "ok" };

  const eigen = stats.filter((r) => r.test_id === test.id);
  const events = eigen.reduce(
    (a, r) => a + (Number(r.views) || 0) + (Number(r.add_to_carts) || 0) + (Number(r.orders) || 0),
    0,
  );

  const gestart = test.started_at ? new Date(test.started_at).getTime() : 0;
  const draaitAl = gestart ? Date.now() - gestart : 0;

  if (events === 0) {
    if (draaitAl < STIL_MS) {
      return {
        status: "wachten",
        uitleg: "Just started — the first visitors should show up within a few minutes.",
      };
    }
    return {
      status: "stil",
      uitleg:
        "This test has been running for a while and nothing has been measured at all. " +
        "Almost always that means the theme snippet is missing or not loading. Open the product " +
        "page and check that the snippet is in the head; until then the test is doing nothing.",
    };
  }

  const laatste = eigen
    .map((r) => (r.last_event_at ? new Date(r.last_event_at).getTime() : 0))
    .reduce((a, b) => Math.max(a, b), 0);

  if (laatste && Date.now() - laatste > STOKKEND_MS) {
    const uren = Math.floor((Date.now() - laatste) / 3600000);
    return {
      status: "stokkend",
      uitleg:
        "Nothing measured for " + uren + " hours while the test is running. That can just be a " +
        "quiet night, but it is also what a broken theme or a removed snippet looks like.",
    };
  }

  return { status: "ok" };
}
