/**
 * Rate limiting for the publicly reachable doors: the measurement endpoints
 * (/api/price-test-event and /api/site).
 *
 * In-process and therefore per serverless instance. That is a real limitation
 * and worth naming: an attacker spread across many cold starts gets a higher
 * effective rate than these numbers suggest. It still raises the bar a long
 * way, because Vercel reuses warm instances heavily, and the alternative — a
 * database round trip per request — would hand a flooder an easy way to make
 * the database the bottleneck instead.
 *
 * The hard ceiling that actually bounds damage is the per-shop daily cap in the
 * event route, which is counted in Postgres.
 */

/**
 * Twee tellers per sleutel: dit venster en het vorige.
 *
 * Hiervoor stond hier een lijst met elk tijdstip. Voor een daglimiet van
 * 500.000 betekende dat tot een half miljoen getallen per winkel, en die werden
 * bij ELK verzoek opnieuw gefilterd - zelf een manier om de server plat te
 * leggen. Twee tellers schatten hetzelfde glijdende venster in vaste ruimte.
 */
type Bucket = { start: number; nu: number; vorige: number; venster: number };

const buckets = new Map<string, Bucket>();
let laatsteOpruiming = Date.now();

/**
 * Is this key still allowed, given max hits per window?
 *
 * Sliding window estimate: the previous window's count weighted by how much of
 * it still overlaps, plus this window's count. A fixed window would let
 * someone send double the allowance across a window boundary.
 */
export function magNog(sleutel: string, max: number, vensterMs: number): boolean {
  const tijd = Date.now();

  // Opruimen met het venster van elke emmer zelf. Eerder gebruikte dit het
  // venster van wie toevallig aanriep, en dan wiste een minuutlimiet de
  // daglimieten.
  if (tijd - laatsteOpruiming > 60_000) {
    laatsteOpruiming = tijd;
    for (const [k, b] of buckets) {
      if (tijd - b.start > b.venster * 2) buckets.delete(k);
    }
  }

  let b = buckets.get(sleutel);
  if (!b) {
    b = { start: tijd, nu: 0, vorige: 0, venster: vensterMs };
    buckets.set(sleutel, b);
  }

  const verstreken = tijd - b.start;
  if (verstreken >= vensterMs * 2) {
    b.start = tijd; b.vorige = 0; b.nu = 0;
  } else if (verstreken >= vensterMs) {
    b.start += vensterMs; b.vorige = b.nu; b.nu = 0;
  }

  const overlap = 1 - (tijd - b.start) / vensterMs;
  if (b.vorige * overlap + b.nu >= max) return false;

  b.nu += 1;
  return true;
}

/**
 * Caller's IP.
 *
 * On Vercel x-forwarded-for is set by the platform and the left-most entry is
 * the client. Trusting that header is only safe because nothing but Vercel can
 * reach this process; behind a different proxy it would be spoofable.
 */
export function ipVan(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "onbekend";
}
