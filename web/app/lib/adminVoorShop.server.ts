import { unauthenticated } from "~/shopify.server";

/**
 * Admin API access for the standalone dashboard.
 *
 * There is no logged-in Shopify user there, so it goes through the stored
 * offline session. Returns null rather than throwing: without Shopify the
 * screens should still show visitors and setup instead of an error page.
 */
export async function adminVoorShop(shop: string | null) {
  if (!shop) return null;
  try {
    const { admin } = await unauthenticated.admin(shop);
    return admin;
  } catch {
    return null;
  }
}
