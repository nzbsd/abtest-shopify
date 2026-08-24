/**
 * Wat er mis is met de configuratie, of niets.
 *
 * Dit stond in dashboardAuth.server.ts, samen met een wachtwoord, een
 * sessiecookie en een SSO-kaartje voor het losse dashboard. Dat dashboard
 * bestaat niet meer - de app draait alleen nog binnen Shopify - en met die
 * hele auth-laag is ook het enige stuk verdwenen dat zelf moest bepalen wie
 * er binnen mocht. Wat overbleef was deze controle.
 */
export function configProbleem(): string | null {
  const mist = [
    ["SUPABASE_URL", process.env.SUPABASE_URL],
    ["SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY],
    ["SHOPIFY_API_KEY", process.env.SHOPIFY_API_KEY],
    ["SHOPIFY_API_SECRET", process.env.SHOPIFY_API_SECRET],
    ["SHOPIFY_APP_URL", process.env.SHOPIFY_APP_URL],
  ]
    .filter(([, waarde]) => !waarde)
    .map(([naam]) => naam as string);

  return mist.length ? "Ontbrekende omgevingsvariabelen: " + mist.join(", ") : null;
}
