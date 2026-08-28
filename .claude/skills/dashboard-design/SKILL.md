---
name: dashboard-design
description: De visuele taal voor dashboards en analytics-schermen in deze app - schaal, kleur, micrografieken, bento-indeling en beweging. Gebruik dit bij elk scherm dat cijfers toont: een nieuw dashboard of paneel, een kpi-kaart, grafiek, tabel of vergelijking, of wanneer iemand vraagt om iets "mooier", "cleaner", "strakker", "professioneler" of "duurder" te maken. Ook bij vragen als "dit ziet er saai uit", "kan dit er beter uitzien", "make this look premium", "add some polish", of wanneer er een screenshot van een ander dashboard wordt gedeeld als voorbeeld. Trigger ook als het woord dashboard niet valt maar het werk duidelijk een scherm met cijfers raakt.
---

# Dashboardontwerp

## Waar dit over gaat

Een dashboard dat er duur uitziet verschilt bijna nooit van een dashboard dat
er goedkoop uitziet in kleur, effecten of slimme grafieken. Het verschil zit in
**schaal, lucht en terughoudendheid**.

Dat is geen mening. Het is getest op deze codebase: het dashboard had al lichte
canvas, witte kaarten, gelaagde schaduwen en een samenhangend kleurenpalet — en
zag er nog steeds uit als een tabel. Wat eraan mankeerde was dat de kengetallen
op 25px stonden in kaarten met 15px binnenruimte. Op 40px in kaarten met 24px
werd het een dashboard. Er is geen kleur of element aan toegevoegd.

Begin daarom altijd bij de vraag: **is dit een kwestie van maat, of van
inhoud?** Negen van de tien keer is het maat.

---

## De vijf regels die het meeste doen

### 1. Het cijfer is de held, het label fluistert

Eén getal per kaart mag groot zijn. Echt groot — 40 tot 56 pixels, gewicht 700,
en negatieve letterspatiëring omdat de standaard op die maat uit elkaar valt
(vooral tussen een valutateken en een cijfer).

Het label eromheen gaat **omhoog in positie en omlaag in nadruk**: klein
(11–12px), gedempt (de op twee na donkerste inkt, niet de tweede), en boven het
getal. Je leest het label, dan landt het cijfer. Andersom moet je zoeken.

```css
.kpi__label { font-size: 12px; font-weight: 600; color: var(--ink-3); }
.kpi__value { font-size: 40px; font-weight: 700; letter-spacing: -.04em; line-height: 1.02; }
```

Twee grote getallen naast elkaar in één kaart concurreren. Als je er twee nodig
hebt, zijn het twee kaarten.

### 2. Kleur zit in de data, niet in het meubilair

De navigatie, de kaarten, de knoppen, de randen: allemaal neutraal. Grijs, wit,
bijna-zwart. Wat kleur krijgt is de data zelf.

En dan: **één verzadigde tint per widget.** De betalingsgrafiek is blauw. De
retentiecurve is roze. De transacties zijn groen. Niet twee kleuren in één
kaart, tenzij ze twee series onderscheiden die je moet kunnen vergelijken.

Zo krijg je een scherm dat kleurrijk oogt terwijl elke afzonderlijke kaart
rustig is. Dat is precies het gevoel dat mensen "clean maar niet saai" noemen.

Uitzonderingen die geen kleur zijn maar status: groen omhoog, rood omlaag. Die
horen bij deltas en waarschuwingen, en mogen nooit als seriekleur dienen —
anders weet je niet meer of blauw "test" betekent of "goed".

### 3. Eén expressief vlak per scherm, niet meer

Er mag precies één kaart zijn die alle regels breekt: een verloop over de volle
kaart, witte tekst, een enorm getal. In de referentie is dat de Insights-kaart.

Hij werkt **omdat** de rest rustig is. Twee zulke kaarten en het effect is weg;
drie en het is een marketingpagina. Zet er iets in dat de aandacht ook verdient:
de uitkomst, de aanbeveling, het ding waar iemand voor kwam.

Zie `references/components.md` voor de opbouw van zo'n vlak.

### 4. Micrografieken in plaats van grafiekmeubilair

Assen, gridlijnen, legenda's en tickmarks kosten ruimte en aandacht, en op een
overzichtsscherm voegen ze zelden iets toe. Iemand wil de vorm zien, niet de
waarde aflezen; wie de waarde nodig heeft klikt door.

Vervang ze door:

| in plaats van | gebruik |
|---|---|
| staafdiagram met assen | stippenmatrix of sparkline zonder assen |
| taartdiagram | rijen met een dunne voortgangsbalk eronder |
| lijngrafiek met grid | gestapeld vlak met alleen begin- en eindlabel |
| datalabel bij elk punt | één badge bij de piek, de rest op hover |

Een volledige grafiek met assen hoort op een detailscherm, niet op het
overzicht. Recepten staan in `references/components.md`.

### 5. Bento, geen rij van vier

Kaarten van gelijke maat naast elkaar lezen als een tabel. Geef ze verschillende
breedtes en hoogtes, passend bij hoeveel ze te zeggen hebben: de belangrijkste
kaart twee kolommen breed, een kengetal één, de grafiek twee rijen hoog.

De ruimte tússen kaarten schaalt mee met de ruimte erbinnen. Kaarten met 24px
binnenruimte en 14px ertussen plakken aan elkaar; 18 tot 20px ertussen klopt.

---

## De maatvoering

Neem deze over tenzij je een reden hebt om af te wijken. De getallen zijn niet
willekeurig — ze komen uit wat op deze codebase getest is.

```
uitslag / hero-cijfer      46px  gewicht 700  spatiëring -.045em
kpi-cijfer                 40px  gewicht 700  spatiëring -.04em
secundair cijfer           22px  gewicht 700  spatiëring -.03em
paginatitel                21px  gewicht 700  spatiëring -.03em
kaarttitel                 15px  gewicht 650
label boven een cijfer     12px  gewicht 600  gedempt
bijschrift / notitie     11.5px  gewicht 400  gedempt

kaartpadding            22px 24px
kaartkop            20px 24px 12px
ruimte tussen kaarten       18px
kaartradius                 16px
pilradius                  999px
```

Op smalle schermen gaat alles een trap terug. Deze app draait ingebed in de
Shopify-admin en die kolom kan smal zijn — een cijfer van 40px in 230px breedte
breekt. Zet die regels **onderaan het stylesheet**, zodat de volgorde de
basiswaarden niet overrulet:

```css
@media (max-width: 700px) {
  .kpi { padding: 18px; }
  .kpi__value { font-size: 32px; }
  .verdict__cijfer { font-size: 36px; }
  .grid, .stack { gap: 14px; }
}
```

---

## Beweging

Animatie op een dashboard heeft één taak: laten zien dat een getal *een waarde
is die ergens vandaan komt*. Niet vermaken.

De drie die de moeite waard zijn:

1. **Cijfers tellen op** bij binnenkomst (~400ms). Dit is de enige animatie die
   mensen bewust opvalt en waarderen, omdat het de grootte van het getal
   voelbaar maakt.
2. **Balken en vlakken groeien vanaf nul** (~500ms, uitlopend). Een balk die er
   al staat is een plaatje; een balk die groeit is een meting.
3. **Hover onthult detail.** De tooltip is waar de assen gebleven zijn.

Alles bij elkaar onder de 600ms, met een uitlopende curve
(`cubic-bezier(.23, 1, .32, 1)`). En altijd achter `prefers-reduced-motion`.

Wat je niet doet: kaarten die ademen onder de muis, doorlopende pulsjes,
inschuivende elementen bij elke tabwissel. Een dashboard waar iemand naar zit te
kijken moet stilstaan. De volledige set staat in `references/motion.md`.

---

## Werkwijze

1. **Meet eerst.** Voordat je iets herontwerpt: lees de bestaande waarden op.
   `getComputedStyle` op het cijfer, de kaartpadding en de ruimte ertussen. Als
   het cijfer onder de 30px staat en de padding onder de 20, is dat je antwoord
   en hoef je verder niets aan te raken.

2. **Verander de maat voordat je iets toevoegt.** Nieuwe kleuren, verlopen en
   grafiektypes zijn verleidelijk en lossen zelden op wat er mis is.

3. **Werk in de bestaande tokens.** Deze app heeft ze al (`--ink`, `--ink-3`,
   `--line`, `--r-lg`, `--shadow-card`). Een nieuwe hardgecodeerde kleur is
   bijna altijd een fout — kijk eerst of er een token voor is.

4. **Controleer contrast als je een vlak donkerder of lichter maakt.** Tekst op
   4,5:1 minimaal. Een dempende opacity die op een donkere achtergrond prima
   las, zakt op een lichtere onder de norm. Reken het na, schat het niet.

5. **Zeg wat je niet kunt zien.** Als je het resultaat niet kunt bekijken —
   geen screenshot, ingeklapte viewport — zeg dat, en zeg welke keuzes daardoor
   op redenering berusten in plaats van op waarneming.

---

## Wat dit níét is

Geen kopie van een specifiek dashboard. Als iemand een screenshot deelt, haal er
het *systeem* uit — welke hiërarchie, welke terughoudendheid, waar zit de kleur —
en niet de exacte kaarten. Een gekopieerde indeling past nooit op andere data.

En geen dwangbuis. Als een scherm zes gelijkwaardige kengetallen toont, is een
rij van zes daar het eerlijke antwoord op, en werkt bento tegen je.

---

## Verder lezen

- `references/components.md` — recepten: kpi-kaart, stippenmatrix, sparkline,
  voortgangsrij, delta-pil, verloopkaart, tooltip, bento-raster. Lees dit als je
  een specifiek onderdeel bouwt.
- `references/motion.md` — de volledige bewegingsset met code, inclusief het
  opteleffect en de reduced-motion-afhandeling.
- `references/experli.md` — hoe dit op déze codebase valt: welke klassen er al
  zijn, waar het stylesheet staat, wat er al gedaan is en wat nog open staat.
  Lees dit voordat je in `dashboard.css` iets wijzigt.
