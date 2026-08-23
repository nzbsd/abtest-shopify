# Herbies Experli

A/B-tests op de storefront, als **aparte** Shopify-app naast Email Pop up, met
een eigen dashboard op Vercel.

## Waarom apart van de bestaande app

**Deploy-koppeling.** `shopify app deploy` hercompileert en herreleaset alle
extensies van een app tegelijk. De Email Pop up-app bevat `bundle-bxgy`, de
Discount Function achter de bundels. Tijdens één middag popup-werk zag ik die
function vier keer meegereleased worden zonder dat er een regel aan veranderd
was. Testen daar toevoegen zou dat aantal deploys verhogen, met de
bundelkorting als stille passagier.

**Scope.** Deze app leest producten en orders. Die rechten horen niet bij de
popup-app thuis.

## Wat je kunt testen

Drie types. De machinerie eronder is voor alle drie hetzelfde — bezoeker in een
groep, groep in de cart, orders toewijzen op dat kaartje — alleen wat de
testgroep te zien krijgt verschilt.

| Type | Wat verschilt | Hoe |
|---|---|---|
| **Price** | de prijs | testgroep gaat naar een duplicaat-product met een andere prijs |
| **Page design** | de productpagina | testgroep krijgt `?view=<suffix>`, een alternatief template |
| **Page versus page** | twee willekeurige pagina's | testgroep wordt van de ene URL naar de andere gestuurd |

Aanmaken gaat via een wizard in vier stappen: type, opzet, verdeling, controle.
Wat je per type in Shopify moet klaarzetten staat in stap 1 bij het type zelf.

## Hoe de prijstest werkt

Shopify kent één prijs per variant en kan die niet per bezoeker verhogen.
Daarom draait de prijstest op **twee echte producten**:

| | Product | Prijs |
|---|---|---|
| Controlegroep | het origineel | huidige prijs |
| Testgroep | een duplicaat | de prijs die je wilt testen |

De bezoeker komt binnen op de URL van het origineel; zit hij in de testgroep,
dan stuurt het thema hem door naar het duplicaat. Vanaf dat moment is alles
echt: de prijs op de pagina, de staffelkorting, het abonnement, en het bedrag
in de kassa.

### Waarom doorsturen en niet de prijs herschrijven

Een eerdere versie herschreef de prijs op de pagina. Op een echt thema betekent
dat: staffels, abonnementskorting en marktprijzen namaken in JavaScript, en dat
voor altijd goed houden — met een stil verkeerde prijs als faalwijze. Deze app
wijzigt daarom **geen** prijzen. Doorsturen naar een echte pagina geeft dat
allemaal terug aan Shopify, dat het al goed doet.

### Wat er gebeurt als iets misgaat

Is de app onbereikbaar of ontbreekt het duplicaat, dan doet het thema
**niets** en ziet de bezoeker de originele pagina tegen de originele prijs. Er
is geen pad waarin iemand een prijs ziet die de kassa niet rekent.

Ter waarschuwing, een nog eerdere opzet: die verhoogde de echte prijs en gaf de
controlegroep het verschil terug via een Discount Function. Daar viel de fout de
verkeerde kant op — bij uitval betaalde *iedereen* te veel.

## Wat je zelf aan het duplicaat moet koppelen

Een duplicaat krijgt een nieuw product-id, en daar hangt van alles aan:

- **de bundelconfig** — die keyt op product-id, dus het duplicaat staat er niet
  automatisch in
- **het selling plan** — anders kan de testgroep geen abonnement afsluiten
- **reviews**, als je die per product toont

Vergeet je er een, dan meet je dát verschil in plaats van de prijs. De controle
vóór het starten kijkt hierop en weigert te starten als het duplicaat geen
selling plan heeft, niet in de bundelconfig staat, of nog op DRAFT staat.

## Hoe orders worden toegewezen

Op het **kaartje in de cart**, niet op het product. Het origineel wordt ook
verkocht via ads, e-mail en upsells; die bezoekers zaten nooit in de test. Op
product toewijzen gaf 13,9% conversie — meer orders dan gemeten bezoekers.

Rebills tellen niet mee (`sourceName != "web"`). Het origineel heeft een
bestaand abonneebestand en het duplicaat niet, dus terugkerende betalingen
zouden de controlegroep gratis omzet geven die niets met de test te maken heeft.

## Dashboard

Instellen en cijfers staan op `/dashboard` van de eigen deploy, en dezelfde
pagina's draaien ingebed in de Shopify-admin. Buiten Shopify zit er een
wachtwoord voor (`DASHBOARD_PASSWORD`); staat dat niet ingesteld, dan komt
niemand binnen.

Op de analyticspagina staat **omzet per bezoeker** vooraan en conversie
ernaast. Conversie alleen misleidt bij een prijstest: een hogere prijs drukt de
conversie bijna altijd, terwijl de omzet kan stijgen.

De Forecast-tab rekent door naar de klantlevensduur. Bij een abonnementsproduct
wint niet per se de prijs met de hoogste omzet vandaag: een hogere prijs die
minder abonnees oplevert kan over 1,6 maanden gemiddelde levensduur alsnog
verliezen. Daar staat ook bij hoeveel levensduur er nodig is om het om te
draaien.

## Omgevingsvariabelen

```
SHOPIFY_API_KEY
SHOPIFY_API_SECRET
SHOPIFY_APP_URL           de URL van de Vercel-deploy
SCOPES=read_products,read_orders,read_themes
SUPABASE_URL              https://qeozjlrswqummkcasewb.supabase.co
SUPABASE_SERVICE_ROLE_KEY dezelfde als de Email Pop up-app
DASHBOARD_PASSWORD        toegang tot /dashboard
SESSION_SECRET            optioneel; valt anders terug op SHOPIFY_API_SECRET
SHOP_DOMAIN               optioneel; anders afgeleid uit de opgeslagen sessie
BUNDLE_CONFIG_URL         optioneel; zonder deze slaat de bundelcontrole over
```

De database is gedeeld met de popup-app, maar de sessies niet: die staan in een
eigen tabel `price_test_sessions`. Shopify geeft elke offline sessie het id
`offline_<shop>`, identiek voor alle apps — dezelfde tabel delen zou bij
installatie het access token van de popup-app overschrijven.
