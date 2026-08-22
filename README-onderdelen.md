# Onderdelen en werkvolgorde

Aanvulling op `README.md`.

## Wat er staat

| Bestand | Rol |
|---|---|
| `extensions/price-test/src/run.js` | Discount Function: geeft de controlegroep het verschil terug |
| `extensions/price-test/src/run.graphql` | input-query; leest cohort uit cart-attributen |
| `web/app/lib/priceTest.server.ts` | prijzen per markt zetten en terugdraaien, config naar het metafield |
| `web/app/routes/app.price-test.tsx` | instelpagina: product, markten, bedragen, split, starten/stoppen |
| `web/app/routes/app.price-test-results.tsx` | resultaten per groep en per markt |
| `web/app/routes/api.price-test.tsx` | publieke config voor het thema |
| `web/app/routes/api.price-test-event.tsx` | meetpunt voor view en add-to-cart |
| `web/app/routes/webhooks.orders.create.tsx` | omzet per groep, idempotent per order |
| `theme/price-test.liquid` | cohorttoewijzing + cart-attributen |
| `web/supabase/migrations/0001_price_tests.sql` | datamodel |

## Volgorde bij starten en stoppen

Die volgorde is bewust en staat zo in de code:

**Starten** — eerst de kortingconfig schrijven, dan pas de prijs omhoog.
Andersom ontstaat een venster waarin de prijs verhoogd is terwijl de
controlegroep zijn teruggave nog niet krijgt; dan betaalt iedereen te veel.

**Stoppen** — eerst de prijzen terug, dan pas de korting weghalen. Andersom
betaalt de controlegroep even de testprijs zonder teruggave.

Lukt het zetten van de prijs in één markt niet, dan draait de code de al
gezette markten terug. Half doorgevoerd is erger dan niet doorgevoerd.

## Nog te doen voordat dit kan draaien

1. `shopify app config link` — registreert de app, vult `client_id` en `handle`
2. Vercel-project voor `web/`, env-variabelen zetten
3. Migratie draaien in Supabase
4. `shopify app deploy` — publiceert de Function
5. In Shopify een **automatische korting** aanmaken met deze Function, met
   `combinesWith.productDiscounts = true` zodat hij naast de bundelkorting mag
   bestaan
6. De id van die korting in `PRICE_TEST_DISCOUNT_NODE_ID` zetten
7. `theme/price-test.liquid` in het thema plaatsen en `app_base` invullen

Stap 5 en 6 zijn niet optioneel. Zonder gekoppelde korting weigert de
instelpagina een test te starten — dan zou de controlegroep de testprijs
betalen zonder teruggave.

## Wat ik niet heb kunnen testen

Niets hiervan heeft gedraaid. De app bestaat nog niet bij Shopify, er is geen
Vercel-deploy en de Supabase-connector was in deze sessie niet bereikbaar. Dit
is dus code die volgens de bestaande patronen van de Email Pop up-app is
geschreven en logisch klopt, maar nog geen enkele keer is uitgevoerd.

Reken op een testronde per onderdeel: eerst de Function met een testcart, dan
het starten/stoppen op één markt met een klein bedrag, en pas daarna een echte
test.
