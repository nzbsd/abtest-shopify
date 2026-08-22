# Herbies Price Test

Prijs-A/B-tests per product en per markt, als **aparte** Shopify-app naast
Email Pop up.

## Waarom apart van de bestaande app

**Deploy-koppeling.** `shopify app deploy` hercompileert en herreleaset alle
extensies van een app tegelijk. De Email Pop up-app bevat `bundle-bxgy`, de
Discount Function achter je bundels. Tijdens één middag popup-werk zag ik die
function vier keer meegereleased worden (versies 91, 93, 95, 96) zonder dat er
een regel aan veranderd was. Prijstesten daar toevoegen zou dat aantal deploys
flink verhogen, met je bundelkorting als stille passagier.

**Scope.** Prijzen wijzigen vraagt `write_products`. Die scope aan de bestaande
app toevoegen betekent dat óók een bug in de popup- of bundelcode productprijzen
kan overschrijven. Hier staat die bevoegdheid geïsoleerd.

## Hoe de prijstest werkt

Shopify laat de prijs niet per bezoeker verhogen — kortingen gaan alleen omlaag.
Daarom werkt het omgekeerd:

1. De echte productprijs wordt de **hoogste** variant die je wilt testen
2. De **controlegroep** krijgt via een Discount Function het verschil terug
3. De **testgroep** krijgt niets en betaalt dus de nieuwe prijs

Voor de klant is dat geen zichtbare korting: de kortingsregel blijft naamloos en
het thema toont meteen de juiste prijs.

### Raakt dit de bundels?

Nee, en dat is op twee manieren geborgd:

1. De bestaande bundelkorting staat op `combinesWith.productDiscounts = true`
   (gecontroleerd op de live shop), dus een tweede automatische productkorting
   mag ernaast bestaan in plaats van hem te verdringen.
2. De prijstest-Function kort **alleen de gewone betaalde regel**. Regels met
   `_bundle_free` of `_bundle_gift` slaat hij over. De twee functions raken
   daardoor nooit dezelfde cartregel.

Het gratis stuk uit de bundel blijft dus gratis, ongeacht de testprijs.

### Het risico dat wél blijft

Zolang een test loopt staat de echte prijs in Shopify hoog. Valt de Discount
Function uit, dan betaalt iedereen die hoge prijs — ook de controlegroep. Dat is
inherent aan het mechanisme: Shopify kent geen toeslag, alleen korting. Daarom
bewaart `price_tests.markets[].baseline_amount` per markt de oorspronkelijke
prijs, zodat terugzetten één actie is en niet van iemands geheugen afhangt.

## Opzetten

De app is nog niet geregistreerd bij Shopify — dat vraagt een interactieve
sessie. Stappen:

```bash
cd price-test-app
shopify app config link
```

Kies je Partner-organisatie en maak een nieuwe app aan. Dat vult `client_id` en
`handle` in `shopify.app.toml`.

Daarna een Vercel-project voor `web/` en deze env-variabelen zetten
(dezelfde Supabase als de Email Pop up-app — de tabellen staan naast elkaar):

```
SHOPIFY_API_KEY
SHOPIFY_API_SECRET
SCOPES=read_products,write_products,read_orders,write_discounts
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Zet `application_url` in de toml op de Vercel-URL en draai de migratie in
`web/supabase/migrations/0001_price_tests.sql`.

