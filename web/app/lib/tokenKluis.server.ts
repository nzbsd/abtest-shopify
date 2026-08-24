import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Het Shopify-token versleuteld opbergen.
 *
 * WAT DIT TEGENHOUDT
 * De sessietabel heeft RLS aan zonder policies, dus met de publieke sleutel
 * kom je er niet bij. Wat overbleef is de service-role-sleutel: die gaat langs
 * RLS heen. Wie hem te pakken krijgt - uit een backup, uit een omgeving, uit
 * het dashboard - las tot nu toe het token en kon daarmee de winkel besturen.
 *
 * Na deze wijziging is die sleutel niet meer genoeg. Je hebt er ook
 * SHOPIFY_API_SECRET bij nodig, en die staat in Vercel en niet in de database.
 * Twee plekken die allebei moeten lekken in plaats van één.
 *
 * WAAROM GEEN EIGEN SLEUTEL IN DE OMGEVING
 * Dat zou een variabele zijn die niets anders doet dan bestaan, en die bij een
 * verkeerde kopie tussen omgevingen elke sessie onleesbaar maakt. Deze sleutel
 * is afgeleid van iets dat er toch al moet zijn: zonder SHOPIFY_API_SECRET
 * werkt de app sowieso niet. Afleiden gebeurt met HKDF en een eigen label, dus
 * de sleutel die hier gebruikt wordt is niet hetzelfde getal als het
 * app-geheim - dat blijft alleen voor Shopify.
 */

const VERSIE = "v1";
const ZOUT = "price-test-sessions";
const LABEL = "accessToken";

/** Welke velden uit de sessie geheim zijn. De rest - shop, scope, id - niet. */
const GEHEIM = new Set(["accessToken"]);

let _sleutel: Buffer | null = null;

function sleutel(): Buffer {
  if (_sleutel) return _sleutel;
  const geheim = process.env.SHOPIFY_API_SECRET;
  if (!geheim) throw new Error("SHOPIFY_API_SECRET ontbreekt; sessie kan niet versleuteld worden");
  _sleutel = Buffer.from(hkdfSync("sha256", Buffer.from(geheim, "utf8"), Buffer.from(ZOUT), Buffer.from(LABEL), 32));
  return _sleutel;
}

/**
 * Herkenbaar aan de versie voorop, zodat een oude waarde die er nog plat in
 * staat te onderscheiden is van een versleutelde. Zonder dat zou je moeten
 * gokken, en gokken op een token betekent vroeg of laat een winkel die niet
 * meer inlogt.
 */
export function isVersleuteld(waarde: unknown): boolean {
  return typeof waarde === "string" && waarde.startsWith(VERSIE + ".");
}

export function versleutel(klaartekst: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", sleutel(), iv);
  const cijfer = Buffer.concat([c.update(klaartekst, "utf8"), c.final()]);
  return [VERSIE, iv.toString("base64url"), c.getAuthTag().toString("base64url"), cijfer.toString("base64url")].join(".");
}

/**
 * Null bij twijfel, geen exception.
 *
 * Dit gaat mis als het app-geheim ooit geroteerd wordt: dan zijn alle
 * opgeslagen tokens onleesbaar. Dat mag geen kapotte app opleveren. De
 * aanroeper behandelt null als "geen sessie", waarna Shopify er zelf een
 * nieuwe haalt via token exchange en die versleuteld wordt weggeschreven.
 * Rotatie repareert zichzelf dus, in plaats van een herinstallatie te vragen.
 */
export function ontsleutel(waarde: string): string | null {
  const delen = waarde.split(".");
  if (delen.length !== 4 || delen[0] !== VERSIE) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", sleutel(), Buffer.from(delen[1], "base64url"));
    d.setAuthTag(Buffer.from(delen[2], "base64url"));
    return Buffer.concat([d.update(Buffer.from(delen[3], "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** De sessie zoals hij de database in gaat. */
export function sluitOp(velden: [string, any][]): [string, any][] {
  return velden.map(([naam, waarde]) =>
    GEHEIM.has(naam) && typeof waarde === "string" && waarde && !isVersleuteld(waarde)
      ? ([naam, versleutel(waarde)] as [string, any])
      : ([naam, waarde] as [string, any]),
  );
}

/**
 * De sessie zoals hij eruit komt. Null betekent: hier valt niets bruikbaars
 * van te maken, doe alsof de sessie niet bestaat.
 */
export function maakOpen(velden: [string, any][]): { velden: [string, any][]; wasPlat: boolean } | null {
  let wasPlat = false;
  const uit: [string, any][] = [];
  for (const [naam, waarde] of velden) {
    if (!GEHEIM.has(naam) || typeof waarde !== "string" || !waarde) {
      uit.push([naam, waarde]);
      continue;
    }
    if (!isVersleuteld(waarde)) {
      // Van voor deze wijziging. Bruikbaar, maar hij hoort hierna versleuteld
      // terug de database in.
      wasPlat = true;
      uit.push([naam, waarde]);
      continue;
    }
    const open = ontsleutel(waarde);
    if (open === null) return null;
    uit.push([naam, open]);
  }
  return { velden: uit, wasPlat };
}

