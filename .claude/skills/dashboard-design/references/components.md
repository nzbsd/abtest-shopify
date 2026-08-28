# Recepten

Losse onderdelen, met de reden erbij waarom ze zo gebouwd zijn. Pak wat je nodig
hebt; het is geen bibliotheek die je in zijn geheel moet overnemen.

**Inhoud**
1. [Kpi-kaart](#1-kpi-kaart)
2. [Delta-pil](#2-delta-pil)
3. [Stippenmatrix](#3-stippenmatrix)
4. [Sparkline](#4-sparkline)
5. [Voortgangsrij](#5-voortgangsrij)
6. [Verloopkaart](#6-verloopkaart)
7. [Tooltip](#7-tooltip)
8. [Bento-raster](#8-bento-raster)
9. [Pilnavigatie en chips](#9-pilnavigatie-en-chips)
10. [Trechter](#10-trechter)

---

## 1. Kpi-kaart

De basisvorm. Vier zones, van boven naar beneden: een rij met pictogram links en
delta rechts, dan het label, dan het cijfer, dan een notitie.

```html
<article class="kpi card">
  <div class="kpi__top">
    <span class="chip chip--control">{icoon}</span>
    <span class="delta delta--up">▲ 15%</span>
  </div>
  <p class="kpi__label">Omzet per bezoeker</p>
  <p class="kpi__value num">$1,12</p>
  <p class="kpi__note">1.765 bezoekers · 40 orders</p>
</article>
```

De volgorde is niet vrijblijvend. Het pictogram en de delta staan bovenin omdat
ze een vaste plek nodig hebben — anders springt de kaart als de een er wel en de
ander niet is. Het label staat boven het cijfer zodat je weet waar je naar kijkt
voordat je het ziet.

`num` zet `font-variant-numeric: tabular-nums`. Zonder dat springen cijfers bij
elke verversing, en dat valt op zodra iets live bijwerkt.

**Valkuil:** een lang bedrag dat uit de kaart loopt. Zet
`overflow-wrap: anywhere` op de waarde en geef de kolom minstens 230px in de
`auto-fit`-grid.

---

## 2. Delta-pil

```css
.delta {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 10px; border-radius: 999px;
  font-size: 12px; font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.delta--up   { background: var(--up-bg);   color: var(--up); }
.delta--down { background: var(--down-bg); color: var(--down); }
.delta--flat { background: var(--wash);    color: var(--ink-3); }
```

Groen en rood zijn hier status, geen seriekleur. Gebruik ze nergens anders voor,
anders raakt de betekenis verwaterd.

Denk na over wat "omhoog" betekent voordat je groen kiest. Een stijgende
bounce rate is rood. Een dalende kostprijs is groen. Laat de component de richting
meekrijgen in plaats van hem uit het teken af te leiden.

---

## 3. Stippenmatrix

Kolommen van stipjes, waarbij de hoogte van de kolom de waarde is. Leest als een
staafdiagram maar zonder assen, en houdt zijn vorm op 80px breed.

```html
<div class="matrix" role="img" aria-label="Transacties per dag, piek op woensdag">
  <span class="matrix__kolom" style="--n:2"></span>
  <span class="matrix__kolom" style="--n:5"></span>
  ...
</div>
```

```css
.matrix { display: flex; align-items: flex-end; gap: 3px; height: 34px; }
.matrix__kolom {
  width: 5px;
  /* De kolom is een herhaald verloop: n stipjes van 5px met 3px ertussen. */
  height: calc(var(--n) * 8px);
  background-image: radial-gradient(circle at 50% 2.5px, currentColor 2.5px, transparent 2.5px);
  background-size: 5px 8px;
  color: var(--serie);
}
```

Zet `--serie` op de kaart, niet op de stippen — dan bezit de hele widget één
tint, zoals regel 2 van de skill vraagt.

Aria-label is hier geen formaliteit: de matrix is puur visueel en zegt zonder
label niets tegen een schermlezer.

---

## 4. Sparkline

Een lijn zonder assen, met een gevuld vlak eronder in dezelfde tint op lage
dekking. Bouw hem als inline SVG met `preserveAspectRatio="none"` zodat hij zich
naar de kaart voegt.

```jsx
function Sparkline({ punten, kleur }) {
  const max = Math.max(...punten, 1);
  const d = punten.map((p, i) =>
    `${(i / (punten.length - 1)) * 100},${30 - (p / max) * 28}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="spark" aria-hidden="true">
      <polygon points={`0,30 ${d} 100,30`} fill={kleur} opacity=".12" />
      <polyline points={d} fill="none" stroke={kleur} strokeWidth="1.6"
                vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
```

`vectorEffect="non-scaling-stroke"` voorkomt dat de lijn uitrekt als de SVG
niet-uniform schaalt. Zonder dat wordt een sparkline in een brede kaart een
wigvormige streep.

Geen punten op de datapunten. Eén badge bij de piek als er iets te wijzen valt,
de rest op hover.

---

## 5. Voortgangsrij

Voor een verdeling: welk deel komt waarvandaan. Vervangt een taartdiagram, en is
beter omdat je de labels kunt lezen zonder legenda.

```html
<div class="verdeling">
  <div class="verdeling__rij" style="--serie: var(--up); --deel: 64%">
    <span class="verdeling__naam">Online Payments</span>
    <span class="verdeling__waarde num">$26.800</span>
    <span class="verdeling__balk"></span>
  </div>
</div>
```

```css
.verdeling__rij {
  display: grid; grid-template-columns: 1fr auto; gap: 4px 12px;
  align-items: baseline; padding: 12px 0;
}
.verdeling__balk {
  grid-column: 1 / -1; height: 4px; border-radius: 999px;
  background: var(--line);
}
.verdeling__balk::before {
  content: ""; display: block; height: 100%; width: var(--deel);
  border-radius: inherit; background: var(--serie);
}
```

Hier mag je wél meerdere tinten gebruiken, want de kleuren onderscheiden
categorieën. Houd het bij drie of vier; daarboven kan niemand ze uit elkaar
houden en heb je een tabel nodig.

---

## 6. Verloopkaart

Het enige expressieve vlak. Eén per scherm.

```css
.uitgelicht {
  position: relative; overflow: hidden;
  border-radius: var(--r-lg);
  color: #fff;
  background: #2b1f4a;
}
/* Zachte vlekken in plaats van een lineair verloop: dat laatste leest als een
   knop, dit als een oppervlak. */
.uitgelicht::before {
  content: ""; position: absolute; inset: -30%;
  background:
    radial-gradient(40% 50% at 20% 20%, #ff8a3d 0%, transparent 60%),
    radial-gradient(45% 55% at 75% 15%, #f0508c 0%, transparent 62%),
    radial-gradient(50% 60% at 60% 85%, #4d7cff 0%, transparent 65%);
  filter: blur(10px);
}
.uitgelicht > * { position: relative; }
```

Zet er inhoud in die de aandacht verdient — de uitkomst, de aanbeveling, het
antwoord. Een verloopkaart met een willekeurig kengetal erin voelt als opsmuk,
en dat merkt iedereen.

Tekst op zo'n vlak: wit, en controleer het contrast op de líchtste plek van het
verloop, niet op het gemiddelde.

---

## 7. Tooltip

De tooltip is waar de assen gebleven zijn. Hij mag dus meer zeggen dan één
getal: de waarde, en het verband dat je anders in een as zou aflezen.

```
48,6k transacties  ·  Conversie 89%  ·  Uitval −11%
```

Licht vlak, hairline rand, zachte schaduw, radius 8px, 12px tekst. Niet donker —
een donkere tooltip op een licht dashboard trekt harder aan de aandacht dan de
data eronder.

Volg de muis op de as waarlangs bewogen wordt en zet hem vast op de andere. Een
tooltip die in twee richtingen meebeweegt is moeilijk te lezen.

---

## 8. Bento-raster

```css
.bento {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  gap: 18px;
}
.bento > * { grid-column: span 12; }

@media (min-width: 860px) {
  .bento__hoofd  { grid-column: span 8; }
  .bento__zij    { grid-column: span 4; }
  .bento__derde  { grid-column: span 4; }
  .bento__half   { grid-column: span 6; }
}
```

Twaalf kolommen omdat je dan halven, derden en kwarten hebt zonder te rekenen.
Onder de 860px valt alles op één kolom — een bento op een telefoon is gewoon een
stapel, en dat is prima.

Laat de belangrijkste kaart meer ruimte innemen dan de rest. Als alles even
groot is, is niets belangrijk.

---

## 9. Pilnavigatie en chips

```css
.pilnav { display: inline-flex; gap: 2px; }
.pilnav a {
  padding: 9px 16px; border-radius: 999px;
  font-size: 13.5px; font-weight: 600; color: var(--ink-2);
}
.pilnav a[aria-current] { background: var(--ink); color: #fff; }

.chip-knop {
  display: inline-flex; align-items: center; gap: 7px;
  height: 38px; padding: 0 14px;
  border: 1px solid var(--line); border-radius: 999px;
  background: var(--surface); font-size: 13px; font-weight: 600;
}
```

Het actieve item is een gevuld bijna-zwart, niet een gekleurd. Kleur is voor
data (regel 2), en een gekleurde navigatie concurreert met de grafieken.

---

## 10. Trechter

Voor een reeks stappen die elk een deel kwijtraken. De truc is dat de stappen
waar je nú niet naar kijkt gedempt zijn, zodat er één in focus staat.

- Per stap: label boven, cijfer daaronder (~28px), dan de balk.
- Balk in focus: vol verzadigd. De rest: dezelfde tint op ~15% met een diagonale
  arcering, zodat ze zichtbaar bij dezelfde reeks horen maar niet om aandacht
  vragen.
- Hover of klik verplaatst de focus, en de tooltip toont conversie en uitval ten
  opzichte van de vorige stap.

```css
.trechter__balk--dof {
  background:
    repeating-linear-gradient(45deg,
      var(--serie) 0 2px, transparent 2px 6px);
  opacity: .55;
}
```

De arcering doet hier het werk dat grijs niet kan: hij houdt de kleurcodering
intact terwijl hij de nadruk wegneemt.
