# Deze codebase

Lees dit voordat je iets in `dashboard.css` of `app/components/` wijzigt. Er
staat meer dan je zou verwachten, en het opnieuw bouwen van iets dat er al is,
is de grootste tijdverspilling bij dit soort werk.

## Waar het staat

```
web/app/styles/dashboard.css     alles, ~2350 regels, platte CSS (geen Tailwind)
web/app/components/ui.tsx        Card, CardHead, Kpi, Delta, Segmented, Track,
                                 Banner, Badge, Legend, Vergelijk, Tabs, Modal
web/app/components/charts.tsx    Lijn (lijngrafiek), Trechter
web/app/components/iconen.tsx    vlaggen, device- en bronpictogrammen
web/app/views/                   analytics, overview, tests, site, forecast,
                                 besluit, wizard
```

Geen Tailwind, en dat is een bewuste keuze — die erbij halen verandert meer dan
het oplevert. Werk in de bestaande klassen.

## De tokens

Bovenaan `dashboard.css` staat een compleet systeem. Gebruik het; een
hardgecodeerde kleur is bijna altijd een fout.

```
vlakken     --canvas --surface --wash --veil
rail        --rail --rail-2 --rail-ink --rail-ink-2 --rail-line
inkt        --ink --ink-2 --ink-3 --ink-4        (vier niveaus, donker naar licht)
lijnen      --line --line-loud
accent      --iris --iris-lit --iris-pale
series      --control --control-pale --test --test-pale
status      --up --up-bg --down --down-bg
radius      --r-xs 5  --r-sm 8  --r-md 12  --r-lg 16  --r-xl 20
schaduw     --shadow-card --shadow-pop
curve       --ease-out
```

De seriekleuren zijn gevalideerd op kleurenblindheid (ΔE 29,8 bij CVD, beide
≥3:1 op wit). Vervang ze niet zonder opnieuw te toetsen.

Let op de scheiding tussen **serie** en **status**: `--control`/`--test` zijn
seriekleuren, `--up`/`--down` zijn status. Ze door elkaar gebruiken maakt een
grafiek onleesbaar, want dan weet je niet meer of groen "test" of "goed" betekent.

## Wat er al is aan beweging

Dit hoef je niet te bouwen:

| keyframe | doet | zit op |
|---|---|---|
| `tel` | cijfers laten binnenkomen | `.kpi__value`, `.compare__value`, `.verdict__cijfer` |
| `tekenLijn` | lijngrafiek uittekenen | de polyline in `Lijn` |
| `rijs` | trapsgewijs binnenkomen | `.stack > *`, `.grid > *` |
| `verschijn` | opdoemen | tooltips, modals |
| `schuifIn` | omhoog schuiven | tabinhoud, panelen |

`prefers-reduced-motion` is afgevangen. Controleer bij nieuwe animaties of ze
binnen die blokken vallen.

## Twee dubbelingen die er nu in zitten

Opgemerkt bij het schrijven van deze skill, nog niet opgeruimd:

- `@keyframes verschijn` staat twee keer (regel ~792 en ~1171). De laatste wint,
  dus de eerste is dood.
- `.tabinhoud` krijgt twee keer een animatie (regel ~829 `verschijn`, regel ~916
  `schuifIn`). Ook hier wint de laatste, dus de eerste doet niets.

Los ze op als je toch in de buurt bent, maar niet als losse opruimactie midden in
ander werk — dubbele CSS is vervelend, geen storing.

## Wat er al gedaan is

De maatvoering uit de skill is doorgevoerd. Kpi-cijfer 25 → 40px, uitslag
30 → 46px, kaartpadding 15/16 → 22/24, kaartkop 14/18 → 20/24, ruimte tussen
kaarten 14 → 18px, label een stap stiller (`--ink-2` → `--ink-3`). Onderaan het
bestand staat een `max-width: 700px`-blok dat alles een trap terugzet, bewust
onderaan zodat de volgorde de basiswaarden niet overrulet.

De opbouw van `Kpi` klopte al: pictogram en delta bovenin, label, cijfer,
notitie. Dat is dezelfde volgorde als de referentiedashboards gebruiken.

## Wat nog open staat

Op volgorde van wat het meest oplevert:

1. **Eén expressief vlak.** Er is nog geen verloopkaart. De uitslag van een test
   ("+34,6%, nog niet hard genoeg") is de natuurlijke inhoud — dat is waar
   iemand voor komt. Recept in `components.md` §6.

2. **Micrografieken.** Er is een volledige lijngrafiek met assen, gridlijnen en
   tooltip (`Lijn`), en dat is goed op een detailscherm. Op de kpi-kaarten
   ontbreekt de kleine variant: een stippenmatrix of sparkline zonder assen.
   Recepten in `components.md` §3 en §4.

3. **Bento in plaats van een uniform raster.** Nu staan `grid--2`, `grid--3` en
   `grid--4` naast elkaar met gelijke kaarten. Een twaalfkolomsraster waarin de
   belangrijkste kaart breder is, geeft het scherm een middelpunt.
   Recept in `components.md` §8.

4. **Kleur per widget.** De series zijn nu overal iris en oranje, omdat ze
   control en test onderscheiden — dat klopt en moet zo blijven. Maar kaarten
   die géén vergelijking tonen (bezoekers, omzet, apparaten) kunnen elk een
   eigen tint krijgen, zoals regel 2 van de skill beschrijft. Doe dit alleen
   waar geen control/test-betekenis in het spel is; die codering is heilig.

## Waar je op moet letten

**De app draait ingebed in de Shopify-admin.** Die kolom kan smal zijn. Een
cijfer van 40px in 230px breedte breekt, en een kaart met 24px padding houdt daar
te weinig van over. Test op 700px en smaller.

**Er is geen manier om het resultaat te zien vanuit een agent-sessie.** De
browserpane geeft geen screenshots en rapporteert soms `innerWidth: 0`, waardoor
`getComputedStyle` de mobiele tak teruggeeft terwijl je denkt naar desktop te
kijken. Controleer `innerWidth` voordat je een meting vertrouwt, en zeg tegen de
gebruiker welke keuzes op redenering berusten in plaats van op waarneming.

**Het thema van de winkel is iets anders dan het dashboard.** `dashboard.css` is
de admin-app; de winkel zelf zit in `herbies-theme-live`. Verwar de twee niet —
ze delen geen tokens en geen taal.
