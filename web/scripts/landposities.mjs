/**
 * Waar landen liggen, afgeleid uit de kaart in plaats van uit het hoofd.
 *
 * Draait één keer met de hand en schrijft app/lib/landposities.ts. Per land het
 * zwaartepunt van zijn gróótste vlak: voor Frankrijk is dat het vasteland en
 * niet een punt in de Atlantische Oceaan tussen Frans-Guyana en Bretagne in.
 *
 *   node scripts/landposities.mjs
 */
import fs from "node:fs";
import { feature } from "topojson-client";

/**
 * ISO 3166-1 numeriek naar de tweeletterige code die de winkel doorgeeft.
 * Alleen wat in de kaart voorkomt; de rest komt uit KLEIN hieronder.
 */
const NUMMER_NAAR_CODE = {
  "004": "AF", "008": "AL", "010": "AQ", "012": "DZ", "024": "AO", "031": "AZ", "032": "AR",
  "036": "AU", "040": "AT", "044": "BS", "050": "BD", "051": "AM", "056": "BE", "064": "BT",
  "068": "BO", "070": "BA", "072": "BW", "076": "BR", "084": "BZ", "090": "SB", "096": "BN",
  "100": "BG", "104": "MM", "108": "BI", "112": "BY", "116": "KH", "120": "CM", "124": "CA",
  "140": "CF", "144": "LK", "148": "TD", "152": "CL", "156": "CN", "158": "TW", "170": "CO",
  "178": "CG", "180": "CD", "188": "CR", "191": "HR", "192": "CU", "196": "CY", "203": "CZ",
  "204": "BJ", "208": "DK", "214": "DO", "218": "EC", "222": "SV", "226": "GQ", "231": "ET",
  "232": "ER", "233": "EE", "238": "FK", "242": "FJ", "246": "FI", "250": "FR", "260": "TF",
  "262": "DJ", "266": "GA", "268": "GE", "270": "GM", "275": "PS", "276": "DE", "288": "GH",
  "300": "GR", "304": "GL", "320": "GT", "324": "GN", "328": "GY", "332": "HT", "340": "HN",
  "348": "HU", "352": "IS", "356": "IN", "360": "ID", "364": "IR", "368": "IQ", "372": "IE",
  "376": "IL", "380": "IT", "384": "CI", "388": "JM", "392": "JP", "398": "KZ", "400": "JO",
  "404": "KE", "408": "KP", "410": "KR", "414": "KW", "417": "KG", "418": "LA", "422": "LB",
  "426": "LS", "428": "LV", "430": "LR", "434": "LY", "440": "LT", "442": "LU", "450": "MG",
  "454": "MW", "458": "MY", "466": "ML", "478": "MR", "484": "MX", "496": "MN", "498": "MD",
  "499": "ME", "504": "MA", "508": "MZ", "512": "OM", "516": "NA", "524": "NP", "528": "NL",
  "540": "NC", "548": "VU", "554": "NZ", "558": "NI", "562": "NE", "566": "NG", "578": "NO",
  "586": "PK", "591": "PA", "598": "PG", "600": "PY", "604": "PE", "608": "PH", "616": "PL",
  "620": "PT", "624": "GW", "626": "TL", "630": "PR", "634": "QA", "642": "RO", "643": "RU",
  "646": "RW", "682": "SA", "686": "SN", "688": "RS", "694": "SL", "703": "SK", "704": "VN",
  "705": "SI", "706": "SO", "710": "ZA", "716": "ZW", "724": "ES", "728": "SS", "729": "SD",
  "732": "EH", "740": "SR", "748": "SZ", "752": "SE", "756": "CH", "760": "SY", "762": "TJ",
  "764": "TH", "768": "TG", "780": "TT", "784": "AE", "788": "TN", "792": "TR", "795": "TM",
  "800": "UG", "804": "UA", "807": "MK", "818": "EG", "826": "GB", "834": "TZ",
  "840": "US", "854": "BF", "858": "UY", "860": "UZ", "862": "VE", "887": "YE", "894": "ZM",
};

/**
 * Wat te klein is voor een kaart op 1:110 miljoen maar wel bestelt. Malta stond
 * al in het verkeer van deze winkel en ontbreekt in de kaart, dus zonder deze
 * lijst zou zo'n bezoeker gewoon van de bol vallen.
 */
const KLEIN = {
  MT: [35.9, 14.4],   SG: [1.35, 103.8],  HK: [22.3, 114.2],  MO: [22.2, 113.5],
  AD: [42.5, 1.5],    MC: [43.7, 7.4],    LI: [47.2, 9.5],    SM: [43.9, 12.5],
  VA: [41.9, 12.45],  GI: [36.1, -5.35],  JE: [49.2, -2.1],   GG: [49.5, -2.6],
  IM: [54.2, -4.5],   FO: [62.0, -6.8],   AX: [60.2, 20.0],   BH: [26.1, 50.6],
  MV: [3.2, 73.2],    MU: [-20.3, 57.6],  SC: [-4.6, 55.5],   KM: [-11.7, 43.3],
  CV: [16.0, -24.0],  ST: [0.3, 6.6],     BB: [13.2, -59.5],  AG: [17.1, -61.8],
  LC: [13.9, -61.0],  GD: [12.1, -61.7],  VC: [13.25, -61.2], KN: [17.3, -62.7],
  DM: [15.4, -61.4],  AW: [12.5, -70.0],  CW: [12.2, -69.0],  SX: [18.0, -63.1],
  BM: [32.3, -64.8],  KY: [19.3, -81.3],  TC: [21.7, -71.6],  VG: [18.4, -64.6],
  VI: [18.0, -64.8],  AI: [18.2, -63.1],  MS: [16.7, -62.2],  BQ: [12.2, -68.3],
  GP: [16.2, -61.5],  MQ: [14.6, -61.0],  RE: [-21.1, 55.5],  YT: [-12.8, 45.2],
  PF: [-17.7, -149.4], WS: [-13.8, -172.1], TO: [-21.2, -175.2], TV: [-8.5, 179.2],
  KI: [1.9, -157.4],  NR: [-0.5, 166.9],  PW: [7.5, 134.6],   FM: [6.9, 158.2],
  MH: [7.1, 171.4],   GU: [13.4, 144.8],  MP: [15.2, 145.8],  AS: [-14.3, -170.7],
  CK: [-21.2, -159.8], NU: [-19.1, -169.9], WF: [-13.3, -176.2], NF: [-29.0, 167.9],
  XK: [42.6, 20.9],   GF: [4.0, -53.0],   PM: [46.9, -56.3],  GS: [-54.4, -36.6],
  SH: [-15.9, -5.7],  IO: [-7.3, 72.4],   CX: [-10.5, 105.6], CC: [-12.1, 96.9],
  PN: [-24.4, -128.3], TK: [-9.2, -171.8], BV: [-54.4, 3.4],  HM: [-53.1, 73.5],
};

const topo = JSON.parse(fs.readFileSync("node_modules/world-atlas/countries-110m.json", "utf8"));
const landen = feature(topo, topo.objects.countries);

/**
 * Lengtegraden ontvouwen voordat er gerekend wordt.
 *
 * Rusland en Fiji lopen over de 180e meridiaan. Hun punten springen daar van
 * +179 naar -180, en een zwaartepunt over die sprong heen komt ergens uit waar
 * het land niet ligt - Rusland belandde zo op lengtegraad 202, wat na terugreke-
 * nen in Alaska is.
 */
function ontvouw(ring) {
  const uit = [];
  let verschuiving = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x, y] = ring[i];
    if (i > 0) {
      const d = x - ring[i - 1][0];
      if (d > 180) verschuiving -= 360;
      else if (d < -180) verschuiving += 360;
    }
    uit.push([x + verschuiving, y]);
  }
  return uit;
}

/** Terug naar -180..180, zodat de bol er weer wat mee kan. */
const normaliseer = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180;

/** Oppervlak en zwaartepunt van één ring, in graden. Goed genoeg om te kiezen
 *  welk vlak het grootste is en waar het midden ervan ligt. */
function ringMaat(ruweRing) {
  const ring = ontvouw(ruweRing);
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const f = xj * yi - xi * yj;
    a += f; cx += (xj + xi) * f; cy += (yj + yi) * f;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-12) return null;
  return { opp: Math.abs(a), lon: normaliseer(cx / (6 * a)), lat: cy / (6 * a) };
}

const posities = {};
const zonderCode = [];

for (const f of landen.features) {
  const code = NUMMER_NAAR_CODE[String(f.id)];
  if (!code) { zonderCode.push(f.properties?.name); continue; }
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  let beste = null;
  for (const poly of polys) {
    const m = ringMaat(poly[0]);          // [0] is de buitenring; gaten tellen niet mee
    if (m && (!beste || m.opp > beste.opp)) beste = m;
  }
  if (beste) posities[code] = [Math.round(beste.lat * 10) / 10, Math.round(beste.lon * 10) / 10];
}

for (const [code, ll] of Object.entries(KLEIN)) if (!posities[code]) posities[code] = ll;

const regels = Object.keys(posities).sort()
  .map((c) => `  ${c}: [${posities[c][0]}, ${posities[c][1]}],`);

fs.writeFileSync("app/lib/landposities.ts", `/**
 * Waar landen liggen, als breedte- en lengtegraad.
 *
 * Gemaakt met scripts/landposities.mjs. Voor elk land het zwaartepunt van zijn
 * grootste vlak, uit de kaart gerekend en niet uit het hoofd - Frankrijk komt
 * daardoor op het vasteland uit en niet halverwege Frans-Guyana.
 *
 * De kleine landen die op een kaart van 1:110 miljoen ontbreken staan in het
 * script erbij; Malta bestelde hier al en zou anders van de bol vallen.
 */
export const LANDPOSITIES: Record<string, [number, number]> = {
${regels.join("\n")}
};
`);

console.log(Object.keys(posities).length, "landen geschreven");
if (zonderCode.length) console.log("geen ISO-code in de kaart (overgeslagen):", zonderCode.join(", "));
