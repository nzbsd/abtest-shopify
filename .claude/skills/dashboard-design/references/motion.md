# Beweging

Animatie op een dashboard heeft één taak: laten zien dat een getal een waarde is
die ergens vandaan komt. Zodra het vermaakt, staat het in de weg.

De toets die werkt: **zou je het missen als het weg was?** Een opgeteld cijfer
mis je. Een kaart die onder je muis omhoog wipt niet.

---

## De curve en de duur

```css
:root { --ease-out: cubic-bezier(.23, 1, .32, 1); }
```

Uitlopend, altijd. Iets dat snel begint en zacht landt voelt alsof het ergens
naartoe gaat; een symmetrische curve voelt mechanisch.

| wat | duur |
|---|---|
| cijfers optellen | 400ms |
| balken en vlakken groeien | 500ms |
| tooltip verschijnen | 120ms |
| hover-terugkoppeling | 150ms |
| paneelwissel | 260ms |

Alles onder de 600ms. Een dashboard dat je elke keer een seconde laat wachten
voordat het leesbaar is, is traag — ook als het mooi is.

---

## 1. Cijfers optellen

De enige animatie die mensen bewust opmerken en waarderen, omdat het de grootte
van het getal voelbaar maakt. Een sprong van 0 naar 41.540 zegt meer over 41.540
dan het getal alleen.

```jsx
function useTelling(doel, actief = true, duur = 400) {
  const [n, setN] = useState(actief ? 0 : doel);
  useEffect(() => {
    if (!actief) { setN(doel); return; }
    let frame;
    const start = performance.now();
    const stap = (nu) => {
      const t = Math.min(1, (nu - start) / duur);
      // Dezelfde uitloop als de CSS-curve, zodat het bij de rest past.
      setN(doel * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(stap);
    };
    frame = requestAnimationFrame(stap);
    return () => cancelAnimationFrame(frame);
  }, [doel, actief, duur]);
  return n;
}
```

Twee dingen die het verpesten als je ze vergeet:

- **Tabulaire cijfers.** Zonder `font-variant-numeric: tabular-nums` verspringt
  de breedte bij elk frame en trilt het hele getal.
- **Rond pas af bij het weergeven**, niet in de state. Anders zie je bij kleine
  getallen dezelfde waarde tien frames achter elkaar.

Tel alleen op bij binnenkomst, niet bij elke verversing. Een getal dat bij elke
poll opnieuw vanaf nul begint is vermoeiend.

---

## 2. Groeien vanaf nul

Een balk die er al staat is een plaatje. Een balk die groeit is een meting.

```css
@keyframes groei { from { transform: scaleX(0); } }

.verdeling__balk::before {
  transform-origin: left;
  animation: groei .5s var(--ease-out) both;
}
```

`transform` en niet `width`: dat scheelt een layout-berekening per frame, en op
een scherm met twintig balken merk je dat.

Voor een sparkline werkt hetzelfde principe met `stroke-dasharray`:

```css
.spark polyline {
  stroke-dasharray: var(--lengte);
  stroke-dashoffset: var(--lengte);
  animation: teken .6s var(--ease-out) forwards;
}
@keyframes teken { to { stroke-dashoffset: 0; } }
```

Zet `--lengte` vanuit JS met `getTotalLength()`. Een geraden waarde geeft een
lijn die te vroeg stopt of te laat begint.

---

## 3. Trapsgewijs binnenkomen

Kaarten die tegelijk verschijnen voelen als een pagina die laadt; kaarten die
kort na elkaar komen voelen als een pagina die zich opbouwt.

```css
@keyframes schuifIn {
  from { opacity: 0; transform: translateY(6px); }
}
.kaartraster > * {
  animation: schuifIn .3s var(--ease-out) both;
  animation-delay: calc(var(--i) * 40ms);
}
```

Houd de vertraging klein (30–50ms) en het aantal beperkt. Boven de acht kaarten
duurt de laatste te lang en wordt het een effect in plaats van een opbouw.

Zes pixel verplaatsing is genoeg. Meer en het schuift zichtbaar, en dan kijk je
naar de beweging in plaats van naar de kaart.

---

## 4. Hover onthult, hover beweegt niet

De tooltip is waar de assen gebleven zijn — daar mag hover alles doen. Op de
kaart zelf houd je het bij een schaduw die iets dieper wordt.

```css
.card { transition: box-shadow .2s var(--ease-out); }
.card:hover { box-shadow: var(--shadow-pop); }
```

Geen `translateY` op kaarten. Een dashboard waar iemand naar zit te kijken en
waar de muis overheen dwaalt, moet stilstaan. Kaarten die opwippen zijn leuk in
een demo en irritant in gebruik.

---

## 5. Reduced motion

Niet optioneel, en niet alleen netjes: voor sommige mensen veroorzaakt dit soort
beweging echt klachten.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
  }
}
```

Voor het opteleffect kun je dat niet met CSS afvangen, dus vraag het in JS op en
geef het als `actief` aan de hook mee:

```js
const rustig = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const waarde = useTelling(doel, !rustig);
```

Het eindresultaat moet identiek zijn — alleen de weg ernaartoe verdwijnt. Een
scherm dat met reduced motion informatie mist, is stuk.

---

## Wat je niet doet

- Kaarten die ademen, pulseren of zweven onder de muis
- Doorlopende animaties zonder einde (een pulserende stip voor "live" mag, één
  klein element, en verder niets)
- Opnieuw inschuiven bij elke tabwissel — de eerste keer is opbouw, de tiende
  keer is oponthoud
- Getallen die opnieuw optellen bij elke datavernieuwing
- Parallax, iets dat ook maar in de buurt komt van parallax
