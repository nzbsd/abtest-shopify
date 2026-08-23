import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate, sessionStorage } from "~/shopify.server";

/**
 * De winkel heeft andere rechten goedgekeurd.
 *
 * WAAROM DIT ER IS
 * Bij managed installation staan de scopes in shopify.app.toml en beheert
 * Shopify ze. Voeg je er een toe en deploy je, dan keurt de winkel dat goed en
 * krijgt het access token de nieuwe rechten. Onze opgeslagen sessie weet daar
 * alleen niets van: die draagt nog de oude scopestring.
 *
 * Dat is niet cosmetisch. De Remix-bibliotheek vergelijkt de scopes in de
 * sessie met wat er geconfigureerd staat, en op basis daarvan besluit hij of er
 * opnieuw geautoriseerd moet worden. Loopt die vergelijking uit de pas, dan
 * blijft de app met een verouderd beeld werken of stuurt hij eindeloos naar
 * een herautorisatie die niets verandert.
 *
 * Dit is geen theorie: read_themes toevoegen kostte een avond zoeken naar
 * waarom de themalijst leeg bleef terwijl de scope in de toml stond en de
 * deploy geslaagd was. De sessie droeg nog read_orders,read_products.
 *
 * Met deze webhook lost dat zichzelf op: Shopify meldt de wijziging, wij
 * schrijven hem in de sessie, en de volgende aanvraag werkt gewoon.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const nieuw: string[] = (payload as any)?.current ?? [];

  if (session) {
    // toPropertyArray/fromPropertyArray is hoe de sessie ook wordt bewaard, dus
    // het veld bijwerken en opnieuw opslaan houdt hem in precies dezelfde vorm.
    session.scope = nieuw.join(",");
    await sessionStorage.storeSession(session);
    console.log(`[scopes_update] ${shop} -> ${session.scope}`);
  }

  return new Response();
};
