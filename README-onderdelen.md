# Onderdelen en opzetten

Aanvulling op `README.md`.

## Wat er staat

| Bestand | Rol |
|---|---|
| `theme/price-test.liquid` | cohorttoewijzing, prijsweergave en variant-omwisseling |
| `web/app/routes/dashboard.tsx` | dashboard-omhulsel: navigatie en toegang |
| `web/app/routes/dashboard._index.tsx` | analytics: tegels, grafiek, tabellen |
| `web/app/routes/dashboard.tests.tsx` | tests aanmaken, starten, stoppen |
| `web/app/routes/dashboard_.login.tsx` | wachtwoordscherm |
| `web/app/lib/dashboardAuth.server.ts` | sessie en toegang tot het dashboard |
| `web/app/lib/priceTest.server.ts` | producten opzoeken, varianten koppelen |
| `web/app/routes/api.price-test.tsx` | publieke config voor het thema |
| `web/app/routes/api.price-test-event.tsx` | meetpunt voor view en add-to-cart |
| `web/app/routes/webhooks.orders.create.tsx` | omzet per groep, idempotent per order |
| `web/supabase/migrations/0001_price_tests.sql` | datamodel |

Er is bewust **geen** Shopify Function meer. De vorige versie had er een om de
controlegroep korting te geven; met twee echte producten is dat overbodig.

## Waarom de variant-omwisseling op het netwerkverzoek zit

Het thema zet het verborgen `id`-veld bij elke variantwissel opnieuw, dus een
eenmalige aanpassing van het formulier houdt geen stand. Het verzoek naar
`/cart/add` is het enige punt waar het id sowieso langskomt, ongeacht welke knop
of welk script de aanroep doet. Bundel-properties en `selling_plan` blijven daar
onaangeroerd.

Mislukt die omwisseling toch, dan koopt de bezoeker het originele product: te
weinig marge, maar nooit een cart die afwijkt van wat hij zag.

## Grafiekkleuren

Blauw voor de controlegroep, oranje voor de test — slot 1 en 2 uit het
gevalideerde categorische palet. Beide modi zijn door de kleurenblindheids- en
contrastchecks gehaald (worst-pair CVD ΔE 24,7 licht / 26,8 donker). Verander je
ze, draai dan de validator opnieuw in plaats van op het oog te kiezen.

## Opzetten

Wat al gedaan is:

- [x] Shopify-app **Price Test** aangemaakt, client-id `e0127103f68c3a5e74136d4f68fcf9ad`
- [x] `shopify.app.toml` gekoppeld
- [x] migratie gedraaid op het Supabase-project `email-popup`

Wat nog moet:

1. **Vercel-project** voor `web/` — root directory op `web`
2. **Omgevingsvariabelen** zetten (zie `README.md`)
3. `application_url` en `redirect_urls` in `shopify.app.toml` op de echte
   Vercel-URL zetten
4. `shopify app deploy` — publiceert de webhook-configuratie
5. App installeren op de winkel
6. In Shopify een **duplicaat** maken van het testproduct, de prijs erop zetten,
   en bundel + selling plan + reviews eraan koppelen
7. `theme/price-test.liquid` in het thema plaatsen, `app_base` invullen en
   renderen op de productpagina
8. Test aanmaken op `/dashboard/tests` en starten

## Wat nog niet getest is

Er is nog geen echte cart doorheen gelopen. Build en typecheck zijn schoon, het
dashboard is met nepdata op een draaiende server bekeken (geen botsende labels,
geen overflow, donkere modus klopt), maar de thema-kant — prijsweergave en
variant-omwisseling — heeft alleen op papier gedraaid.

Doe voor de eerste echte test in elk geval dit:

- koop als testgroep één stuk en controleer dat de checkout hetzelfde bedrag
  toont als de productpagina
- controleer dat het gratis stuk uit de bundel er nog bij zit
- controleer of je op het duplicaat een abonnement kunt afsluiten
- wissel op de productpagina van variant en kijk of de prijs meebeweegt
