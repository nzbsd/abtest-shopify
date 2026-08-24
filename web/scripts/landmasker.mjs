/**
 * Het landmasker.
 *
 * Draait één keer met de hand en schrijft app/lib/landmask.ts. De uitkomst
 * staat in de repo, zodat de app zelf geen kaartdata of topojson nodig heeft -
 * die twee pakketten zijn alleen om dit bestand te maken.
 *
 * Waarom een masker en geen textuur: een bol met stippen alleen op land is
 * herkenbaar zonder dat er een plaatje geladen hoeft te worden, en een plaatje
 * laden in een ingebedde Shopify-app is precies het soort gedoe waar je later
 * spijt van krijgt. Bitgepakt is dit een paar kilobyte.
 *
 *   node scripts/landmasker.mjs
 */
import fs from "node:fs";
import { feature } from "topojson-client";

const BREED = 360;   // een halve graad per cel in de breedte
const HOOG = 180;

const topo = JSON.parse(fs.readFileSync("node_modules/world-atlas/land-110m.json", "utf8"));
const land = feature(topo, topo.objects.land);

/**
 * Lengtegraden ontvouwen.
 *
 * Fiji, Wrangel, Antarctica en Eurazië lopen over de 180e meridiaan heen. Hun
 * punten springen daar van +179 naar -180, en dan beslaat de bounding box in
 * één klap de hele wereld: bij Fiji leverde dat een band land op rond de hele
 * planeet op zestien graden zuiderbreedte.
 *
 * Door de sprongen weg te tellen loopt de ring door in een lengte-as die
 * verder reikt dan -180..180. De box klopt dan weer, en een punt toetsen we
 * straks ook op zijn plek 360 graden verderop.
 */
function ontvouw(ring) {
  const uit = [];
  let verschuiving = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x, y] = ring[i];
    if (i > 0) {
      const vorige = ring[i - 1][0];
      if (x - vorige > 180) verschuiving -= 360;
      else if (x - vorige < -180) verschuiving += 360;
    }
    uit.push([x + verschuiving, y]);
  }
  return uit;
}

/** Alle ringen platgeslagen, met hun bounding box ernaast. Zonder die box
 *  kost dit per punt duizend ringen; met de box zijn het er een handvol. */
const ringen = [];
for (const f of land.features) {
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const ring = ontvouw(poly[i]);
      let x0 = Infinity, x1 = -Infinity, y0 = 90, y1 = -90;
      for (const [x, y] of ring) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      // i > 0 is een gat (meer, binnenzee): die telt omgekeerd mee.
      ringen.push({ ring, x0, x1, y0, y1, gat: i > 0 });
    }
  }
}

function inRing(ring, x, y) {
  let binnen = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) binnen = !binnen;
  }
  return binnen;
}

const bytes = new Uint8Array(Math.ceil((BREED * HOOG) / 8));
let landCellen = 0;

for (let ry = 0; ry < HOOG; ry++) {
  // Midden van de cel, niet de rand: anders valt een kust net verkeerd.
  const lat = 90 - (ry + 0.5) * (180 / HOOG);
  for (let rx = 0; rx < BREED; rx++) {
    const lon = -180 + (rx + 0.5) * (360 / BREED);
    let raak = 0;
    for (const r of ringen) {
      if (lat < r.y0 || lat > r.y1) continue;
      // Een ontvouwen ring kan links of rechts van het gewone bereik liggen,
      // dus het punt telt ook 360 graden op en neer mee.
      for (const l of [lon, lon + 360, lon - 360]) {
        if (l < r.x0 || l > r.x1) continue;
        if (inRing(r.ring, l, lat)) raak += r.gat ? -1 : 1;
      }
    }
    if (raak > 0) {
      const i = ry * BREED + rx;
      bytes[i >> 3] |= 1 << (i & 7);
      landCellen++;
    }
  }
}

const b64 = Buffer.from(bytes).toString("base64");
const uit = `/**
 * Waar land is, als bitmasker van ${BREED}x${HOOG} cellen.
 *
 * Gemaakt met scripts/landmasker.mjs uit world-atlas land-110m. Eén bit per
 * halve graad: ${landCellen} van de ${BREED * HOOG} cellen zijn land, en het
 * geheel weegt ${(b64.length / 1024).toFixed(1)} kB als tekst.
 *
 * Dit staat hier als string en niet als bestand, zodat de bol geen enkel
 * netwerkverzoek nodig heeft om te weten waar de continenten liggen.
 */
export const MASKER_BREED = ${BREED};
export const MASKER_HOOG = ${HOOG};

const GEPAKT =
  "${b64.match(/.{1,96}/g).join('" +\n  "')}";

/** Uitgepakt naar één bit per cel, één keer per pagina. */
export function landMasker(): Uint8Array {
  const ruw = atob(GEPAKT);
  const uit = new Uint8Array(MASKER_BREED * MASKER_HOOG);
  for (let i = 0; i < uit.length; i++) {
    uit[i] = (ruw.charCodeAt(i >> 3) >> (i & 7)) & 1;
  }
  return uit;
}
`;

fs.mkdirSync("app/lib", { recursive: true });
fs.writeFileSync("app/lib/landmask.ts", uit);
console.log("landmask.ts geschreven:", landCellen, "landcellen,", (b64.length / 1024).toFixed(1), "kB base64");
