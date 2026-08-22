# Herbies Price Test

Prijs-A/B-tests per product, als **aparte** Shopify-app naast Email Pop up, met
een eigen dashboard op Vercel.

## Waarom apart van de bestaande app

**Deploy-koppeling.** `shopify app deploy` hercompileert en herreleaset alle
extensies van een app tegelijk. De Email Pop up-app bevat `bundle-bxgy`, de
Discount Function achter de bundels. Tijdens één middag popup-werk zag ik die
function vier keer meegereleased worden zonder dat er een regel aan veranderd
was. Prijstesten daar toevoegen zou dat aantal deploys verhogen, met de
bundelkorting als stille passagier.

**Scope.** Deze app leest producten en orders. Die rechten horen niet bij de
popup-app thuis.

## Hoe de test werkt

Shopify kent één prijs per variant en kan die niet per bezoeker verhogen.
Daarom draait de test op **twee echte producten**:

| | Product | Prijs |
|---|---|---|
| Controlegroep | het origineel | huidige prijs |
| Testgroep | een duplicaat | de prijs die je wilt testen |

De bezoeker komt binnen op de URL van het origineel en blijft daar. Het thema
bepaalt in welke groep hij zit en vervangt voor de testgroep twee dingen: de
getoonde prijs, en de variant die in de cart belandt.

### Deze app wijzigt geen prijzen

Dat is met opzet. De prijs van het duplicaat zet je zelf in Shopify — per markt
zoals je wilt — en het thema leest hem live uit `/products/<handle>.js`. Daardoor
staat er nergens een prijs opgeslagen die kan gaan afwijken van wat de kassa
rekent, en krijgt elke markt vanzelf de juiste valuta.

### Wat er gebeurt als iets misgaat

Is de app onbereikbaar, ontbreekt het duplicaat, of is een variant niet
gekoppeld, dan doet het thema **niets** en ziet de bezoeker het originele
product tegen de originele prijs. Er is geen pad waarin iemand een prijs ziet
die de kassa niet rekent.

Eerdere opzet, ter waarschuwing: die verhoogde de echte prijs en gaf de
controlegroep het verschil terug via een Discount Function. Daar viel de fout de
verkeerde kant op — bij uitval betaalde *iedereen* te veel — en bovendien zag
ook de controlegroep de hoge prijs op de productpagina, waardoor de test iets
anders mat dan de bedoeling.

## Wat je zelf aan het duplicaat moet koppelen

Een duplicaat krijgt een nieuw product-id, en daar hangt van alles aan:

- **de bundelconfig** — die keyt op product-id, dus het duplicaat staat er niet
  automatisch in
- **het selling plan** — anders kan de testgroep geen abonnement afsluiten
- **reviews**, als je die per product toont

Vergeet je er een, dan meet je dát verschil in plaats van de prijs.

## Dashboard

Instellen en cijfers staan op `/dashboard` van de eigen deploy, niet in de
Shopify-admin. Achter een wachtwoord (`DASHBOARD_PASSWORD`); staat dat niet
ingesteld, dan komt niemand binnen.

Op de analyticspagina staat **omzet per bezoeker** vooraan en conversie
ernaast. Conversie alleen misleidt bij een prijstest: een hogere prijs drukt de
conversie bijna altijd, terwijl de omzet kan stijgen.

## Omgevingsvariabelen

```
SHOPIFY_API_KEY
SHOPIFY_API_SECRET
SHOPIFY_APP_URL           de URL van de Vercel-deploy
SCOPES=read_products,read_orders
SUPABASE_URL              https://qeozjlrswqummkcasewb.supabase.co
SUPABASE_SERVICE_ROLE_KEY dezelfde als de Email Pop up-app
DASHBOARD_PASSWORD        toegang tot /dashboard
SESSION_SECRET            optioneel; valt anders terug op SHOPIFY_API_SECRET
SHOP_DOMAIN               optioneel; anders afgeleid uit de opgeslagen sessie
```

De database is gedeeld met de popup-app, maar de sessies niet: die staan in een
eigen tabel `price_test_sessions`. Shopify geeft elke offline sessie het id
`offline_<shop>`, identiek voor alle apps — dezelfde tabel delen zou bij
installatie het access token van de popup-app overschrijven.
