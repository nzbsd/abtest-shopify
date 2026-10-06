# Herbies Experli

A/B-tests op de storefront en in de kassa, als **aparte** Shopify-app naast
Email Pop up, met een eigen dashboard ingebed in de Shopify-admin.

## Waarom apart van de bestaande app

**Deploy-koppeling.** `shopify app deploy` hercompileert en herreleaset alle
extensies van een app tegelijk. De Email Pop up-app bevat `bundle-bxgy`, de
Discount Function achter de bundels. Testen daar toevoegen zou die function bij
elke deploy stil meenemen.

**Scope.** Deze app leest producten en orders. Die rechten horen niet bij de
popup-app thuis.

## Wat je kunt testen

Zes types. De machinerie eronder is voor allemaal hetzelfde: bezoeker in een
groep, groep in de cart, orders toewijzen op dat kaartje.

| Type | Wat de testgroep krijgt |
|---|---|
| **Price** | doorgestuurd naar een duplicaat-product met een andere prijs |
| **Product images** | een andere eerste foto in de galerij |
| **Page design** | `?view=<suffix>`, een alternatief template |
| **Page versus page** | doorgestuurd van de ene URL naar de andere |
| **Theme** | `?preview_theme_id=`, een ander thema |
| **Checkout** | een blok in de kassa, of verzendopties verbergen/hernoemen/gratis via Shopify Functions |

Aanmaken gaat via een wizard in vijf stappen: type, opzet, doel, doelgroep,
controle.

## Hoe de prijstest werkt

Shopify kent één prijs per variant en kan die niet per bezoeker verhogen.
Daarom draait de prijstest op **twee echte producten**: het origineel voor de
controlegroep, een duplicaat met de testprijs voor de testgroep. Het thema
stuurt de testgroep door naar het duplicaat. Vanaf dan is alles echt: prijs,
staffels, abonnement en het bedrag in de kassa.

Is de app onbereikbaar of ontbreekt het duplicaat, dan doet het thema
**niets** en ziet de bezoeker de originele pagina tegen de originele prijs.

### Wat je zelf aan het duplicaat moet koppelen

Bundelconfig, selling plan, reviews. De controle vóór het starten weigert te
starten als het duplicaat geen selling plan heeft, niet in de bundelconfig
staat, of nog op DRAFT staat.

## Hoe orders worden toegewezen

In de `orders/create`-webhook, en een order telt alleen als:

1. hij uit de **webwinkel** komt (`source_name = "web"`). Abonnements-
   verlengingen (`subscription_contract_checkout_one`) tellen **niet** - die
   nemen de cart-attributen van de eerste bestelling mee, inclusief bezoeker en
   cohort, en gaven de controlgroep zo tientallen orders die niets met de test
   te maken hadden. De **eerste** order van een abonnement komt wel via "web"
   en telt mee, gemarkeerd als abonnement.
2. de bezoeker aantoonbaar **in de test zat**: het cohort staat op de cart
   (`_pt_<testId>`), of hij liet een view op die test achter.
3. bij een producttest het **product in de order zit**. Zit alleen het andere
   artikel erin, of beide (origineel én duplicaat), dan telt de order niet.

Bij een prijstest bepaalt daarna het product de groep (de prijs die echt
betaald is), bij de andere types het cohort van de cart.

Of een orderregel een abonnement is, komt uit één GraphQL-vraag per order: de
REST-payload van de webhook heeft geen selling plan.

## Dashboard

Alleen ingebed in de Shopify-admin; er is geen los dashboard meer.

- **Visitors**: bezoekersanalytics van de hele winkel, met live wereldbol.
- **Live tests**: per lopende test en per variant wie er nu is (5 min), wie
  iets in de cart legde, wie in de kassa zit en wie kocht (15 min), plus de
  orders van vandaag. Bezoekers staan er als korte code, nooit met naam of
  klantnummer. Ververst elke 10 seconden.
- **Overview**, **Tests** (wizard, starten, stoppen, besluitlog) en
  **Analytics** (uitslag, orders, segmenten, LTV-forecast).

Op de analyticspagina staat **omzet per bezoeker** vooraan. Conversie alleen
misleidt bij een prijstest. Add-to-cart telt unieke bezoekers, niet klikken.

Let op: de significantie wordt bij elke keer kijken opnieuw berekend, zonder
correctie voor tussentijds kijken. Kies vooraf hoe lang de test loopt (de
wizard rekent de benodigde steekproef uit) en beslis pas daarna.

## Beveiliging

- De database is gedeeld met de popup-app. Alles van deze app (tabellen,
  views, functies) is alleen bereikbaar voor `service_role`; `anon` en
  `authenticated` hebben er geen rechten op (migratie 0028). Maak een view
  altijd met `with (security_invoker = true)`: `create or replace view` zonder
  die optie zet hem stil terug op "draait als eigenaar".
- Het Shopify-token staat versleuteld (AES-256-GCM) in `price_test_sessions`.
- De publieke meetpunten (`/api/price-test-event`, `/api/site`) accepteren
  alleen bekende velden met een maximale lengte, en hebben limieten per IP,
  per bezoeker en per winkel.
- Bij de-installatie worden lopende tests gestopt. De privacy-webhooks
  (`customers/redact`, `shop/redact`) wissen de gegevens.

## Omgevingsvariabelen

```
SHOPIFY_API_KEY
SHOPIFY_API_SECRET
SHOPIFY_APP_URL           de URL van de Vercel-deploy
SCOPES                    zie shopify.app.toml
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SHOP_DOMAIN               optioneel; voor de bundelcontrole
BUNDLE_CONFIG_URL         optioneel; zonder deze slaat de bundelcontrole over
```

Sessies staan in een eigen tabel `price_test_sessions`: Shopify geeft elke
offline sessie het id `offline_<shop>`, identiek voor alle apps.

## Bekende gaten

- Migraties 0013–0015 zijn nooit in de repo beland. Wat ze (en de losse
  Supabase-migraties van de bezoekersanalytics) aanmaakten, staat nu in
  `0007a_ontbrekende_ddl.sql`, uitgelezen uit de live database.
- Aankoop-rijen in `price_test_events` van vóór de rebill-fix bevatten nog
  verlengingen, en hebben `is_subscription = false` ook waar het wél een
  abonnement was. Die zijn nog niet opgeschoond.
