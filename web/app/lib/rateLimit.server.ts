/**
 * Rate limiting for the two publicly reachable doors: the measurement endpoint
 * and the dashboard login.
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

type Bucket = { tijden: number[] };

const buckets = new Map<string, Bucket>();
let laatsteOpruiming = Date.now();

/**
 * Is this key still allowed, given max hits per window?
 *
 * Sliding window over kept timestamps rather than a fixed counter: a fixed
 * window lets someone send double the allowance across a window boundary.
 */
export function magNog(sleutel: string, max: number, vensterMs: number): boolean {
  const nu = Date.now();

  // Opportunistic cleanup so a long-lived instance does not grow a map for
  // every IP it has ever seen.
  if (nu - laatsteOpruiming > 60_000) {
    laatsteOpruiming = nu;
    for (const [k, b] of buckets) {
      if (!b.tijden.length || nu - b.tijden[b.tijden.length - 1] > vensterMs * 2) buckets.delete(k);
    }
  }

  let b = buckets.get(sleutel);
  if (!b) {
    b = { tijden: [] };
    buckets.set(sleutel, b);
  }

  const grens = nu - vensterMs;
  b.tijden = b.tijden.filter((t) => t > grens);
  if (b.tijden.length >= max) return false;

  b.tijden.push(nu);
  return true;
}

/** Aantal treffers in het venster, zonder er een toe te voegen. */
export function tellingVan(sleutel: string, vensterMs: number): number {
  const b = buckets.get(sleutel);
  if (!b) return 0;
  const grens = Date.now() - vensterMs;
  return b.tijden.filter((t) => t > grens).length;
}

export function wisSleutel(sleutel: string) {
  buckets.delete(sleutel);
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
