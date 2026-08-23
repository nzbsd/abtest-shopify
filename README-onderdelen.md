# Onderdelen en opzetten

Aanvulling op `README.md`.

## Wat er staat

| Bestand | Rol |
|---|---|
| `theme/price-test.liquid` | cohorttoewijzing en het doorsturen per testtype |
| `web/app/lib/testTypes.ts` | de drie testtypes: uitleg, voorbereiding, wat er ontbreekt |
| `web/app/views/wizard.tsx` | aanmaken in vier stappen |
| `web/app/views/tests.tsx` | overzicht, starten, stoppen |
| `web/app/views/analytics.tsx` | uitslag, orders, segmenten, forecast |
| `web/app/lib/stats.ts` | Welch, twee-proporties-z, benodigde steekproef |
| `web/app/lib/forecast.ts` | doorrekenen naar klantlevensduur |
| `web/app/lib/orders.server.ts` | orders ophalen en toewijzen aan een groep |
| `web/app/lib/preflight.server.ts` | controle vóór starten (alleen prijstests) |
| `web/app/lib/health.ts` | draait de test, of is het thema stil |
| `web/app/lib/rateLimit.server.ts` | limieten op het publieke meetpunt |
| `web/app/routes/api.price-test.tsx` | publieke config voor het thema |
| `web/app/routes/api.price-test-event.tsx` | meetpunt voor view en add-to-cart |
| `web/supabase/migrations/` | datamodel |

Er is bewust **geen** Shopify Function. Een eerdere versie had er een om de
controlegroep korting te geven; met twee echte producten is dat overbodig.

## Waarom orders uit de API komen en niet uit de webhook

De `orders/create`-webhook vuurde 269 keer en schreef nul rijen. Belangrijker:
de REST-payload bevat geen `sellingPlan`, dus abonnement-versus-eenmalig viel
er niet uit te halen. De Orders API geeft dat wel, plus `sourceName` om rebills
eruit te filteren, en is herhaalbaar — een gemiste webhook is voorgoed weg.

## Waarom het meetpunt text/plain is

`navigator.sendBeacon` kan geen preflight doen. `application/json` is geen
CORS-safelisted content type, dus het verzoek heeft er een nodig: de browser
geeft `true` terug, zet het in de wachtrij, en laat het vallen. Stil. Dat kostte
een avond. `text/plain` is safelisted; de server parst de body toch als JSON.

Er staat ook een `loader` op die route, puur voor de OPTIONS-preflight —
Remix routeert OPTIONS niet naar `action`.

## Grafiekkleuren

Blauw voor de controlegroep, oranje voor de test — slot 1 en 2 uit het
gevalideerde categorische palet. Beide modi zijn door de kleurenblindheids- en
contrastchecks gehaald (worst-pair CVD ΔE 24,7 licht / 26,8 donker). Verander je
ze, draai dan de validator opnieuw in plaats van op het oog te kiezen.

## Opzetten

Wat al gedaan is:

- [x] Shopify-app **Experli** aangemaakt, client-id `e0127103f68c3a5e74136d4f68fcf9ad`
- [x] Vercel-project `abtest-shopify`, root directory `web`
- [x] migraties gedraaid op het Supabase-project `email-popup`
- [x] app geïnstalleerd op `gydfnz-mc.myshopify.com`
- [x] `theme/price-test.liquid` in de `<head>` van het live thema

Bij een nieuw testtype hoeft er niets aan de app-configuratie te veranderen,
maar het **thema-snippet moet wel bijgewerkt zijn**: de versie die alleen
prijstests kent negeert een template- of url-test stilzwijgend. Zie de kop van
het bestand voor waar hij hoort.

## Wat er echt doorheen gelopen is

De prijstest heeft op de winkel gedraaid met echt verkeer: snippet in de head,
config opgehaald, controlegroep bleef staan, testgroep werd doorgestuurd naar
het duplicaat op €28,95 in plaats van €26,95, selling plan aanwezig op beide,
50/50-verdeling exact over 20.000 simulaties, orders uit beide groepen binnen.

Template- en url-tests zijn wél doorgelopen in de wizard en de config-endpoint,
maar nog **niet** met echt verkeer. Doe voor de eerste daarvan in elk geval:

- open de variant-URL zelf en kijk of hij niet in een doorstuurlus komt
- controleer dat de controlegroep de originele pagina houdt na een refresh
- controleer dat `_pt_cohort` in de cart-attributes staat (`/cart.js`)
