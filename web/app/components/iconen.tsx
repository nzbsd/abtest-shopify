/**
 * Herkenningstekens voor de lijsten op het Visitors-scherm.
 *
 * WAAROM
 * Een lijst van tien regels tekst lees je regel voor regel. Met een merkteken
 * ervoor zie je in één blik dat Facebook bovenaan staat en Google er ergens
 * onder. Dat is het hele doel: sneller kunnen kijken, niet mooier.
 *
 * WAT HIER NIET IN ZIT
 * Geen icoonbibliotheek en geen externe bestanden. Deze tekens zijn klein
 * genoeg om inline te tekenen, en een pakket erbij halen zou voor twintig
 * vormpjes tientallen kilobytes en een extra verzoek kosten - op een scherm
 * dat vooral snel moet zijn.
 *
 * De vormen zijn vereenvoudigd. Ze hoeven niet door te gaan voor het echte
 * logo; ze moeten op zestien pixels herkenbaar zijn naast een naam die er
 * toch al staat.
 *
 * DE WAARDEN KOMEN UIT DE DATA, NIET UIT EEN AANNAME
 * Alle patronen hieronder zijn gekozen op wat er in deze winkel echt
 * langskomt: landen als ISO-code (GB, US, ES), systemen als "Android" en
 * "iOS", en bronnen die zowel een hostnaam kunnen zijn (m.facebook.com) als
 * een utm-waarde (facebook, tw_source=fb). Vandaar dat er op deel van de
 * tekst gematcht wordt en niet op gelijkheid.
 */

/**
 * Een landcode naar zijn vlag.
 *
 * Emoji en geen plaatjes: de browser heeft ze al, ze schalen mee met de
 * tekst, en er is geen enkele afbeelding voor nodig. Windows toont ze als
 * lettercode in plaats van een vlag - daar staat dan "GB" waar elders een
 * vlag staat, wat nog steeds leesbaar is en niemand in de weg zit.
 */
export function vlag(code: string): string | null {
  const c = (code || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return null;   // '??' en vrije tekst hebben geen vlag
  return String.fromCodePoint(...[...c].map((l) => 0x1f1a5 + l.charCodeAt(0)));
}

const V = {
  /* ── apparaten ─────────────────────────────────────────────────────── */
  mobiel: { pad: "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm3 17h4" },
  desktop: { pad: "M3 4h18v12H3zM8 20h8M12 16v4" },
  tablet: { pad: "M5 2h14a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm6 17h2" },

  /* ── systemen ──────────────────────────────────────────────────────── */
  appel: { pad: "M16 13c0-2 1.4-2.8 1.5-2.9-0.8-1.2-2.1-1.4-2.6-1.4-1.1-.1-2.1.6-2.7.6-.6 0-1.4-.6-2.3-.6-1.2 0-2.3.7-2.9 1.8-1.2 2.2-.3 5.4.9 7.2.6.9 1.3 1.8 2.2 1.8.9 0 1.2-.6 2.3-.6 1 0 1.3.6 2.3.6s1.6-.9 2.2-1.7c.4-.6.7-1.2.9-1.9-2.3-.9-1.8-3-1.8-2.9ZM14.4 6.6c.5-.6.8-1.4.7-2.3-.7 0-1.6.5-2.1 1.1-.5.5-.9 1.4-.7 2.2.8.1 1.6-.4 2.1-1Z", vul: true },
  android: { pad: "M6 10v6a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-6zM6 10a6 6 0 0 1 12 0M9 6.5 7.8 4.6M15 6.5l1.2-1.9M9.5 8h.01M14.5 8h.01M4 11v4M20 11v4M9 18v2M15 18v2" },
  windows: { pad: "M3 5.5 10.5 4.4v7.1H3zM12 4.2 21 3v8.5h-9zM3 12.5h7.5v7.1L3 18.5zM12 12.5h9V21l-9-1.2z", vul: true },
  linux: { pad: "M12 3c2.2 0 3.5 1.8 3.5 4 0 1.6.6 2.5 1.4 3.6.9 1.2 1.6 2.4 1.6 4.1 0 3.1-2.9 4.3-6.5 4.3S5.5 17.8 5.5 14.7c0-1.7.7-2.9 1.6-4.1C7.9 9.5 8.5 8.6 8.5 7c0-2.2 1.3-4 3.5-4Z M10.3 8h.01M13.7 8h.01" },
  chromeos: { pad: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 5.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM4.5 7.5h9M12 21l3.6-6.2" },

  /* ── merken ────────────────────────────────────────────────────────── */
  facebook: { pad: "M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12Z", vul: true, kleur: "#1877F2" },
  instagram: { pad: "M8 3h8a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5Zm4 5.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM17 6.6h.01", kleur: "#E4405F" },
  google: { pad: "M21.4 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.3a4.5 4.5 0 0 1-2 3v2.4h3.2c1.9-1.7 2.9-4.3 2.9-7.2Z M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.7-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2L6.4 14Z M12 5.9c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.4L6.4 10c.8-2.4 3-4.1 5.6-4.1Z", vul: true, kleur: "#4285F4" },
  tiktok: { pad: "M16.5 3v2.6a4.9 4.9 0 0 0 3.5 3.3v3a7.8 7.8 0 0 1-3.5-1.2v5.7a5.8 5.8 0 1 1-5-5.7v3.1a2.7 2.7 0 1 0 1.9 2.6V3z", vul: true },
  youtube: { pad: "M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8ZM10 15V9l5.2 3z", vul: true, kleur: "#FF0000" },
  shopify: { pad: "M15.3 5.6c-.1 0-.3.1-.5.1l-.3-.9c-.3-.9-.9-1.4-1.6-1.4h-.2c-.3-.4-.7-.6-1.2-.6-1.4 0-2.6 1.7-3 3.4l-1.1.3c-.7.2-.8.3-.9 1L4.7 19.6l9.1 1.7 3.9-1V6.4c0-.5-.1-.6-.4-.7l-2-.1ZM11.6 6.6l-1.9.6c.3-1.2.9-2.2 1.5-2.5.2.4.4 1 .4 1.9Z", vul: true, kleur: "#95BF47" },

  /* ── algemeen ──────────────────────────────────────────────────────── */
  direct: { pad: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 12h18M12 3c2.5 2.5 3.8 5.6 3.8 9S14.5 21 12 21s-3.8-2.5-3.8-9S9.5 3 12 3Z" },
  mail: { pad: "M3 6h18v12H3zM3 7l9 6 9-6" },
  zoeken: { pad: "M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM21 21l-4.4-4.4" },
  eigen: { pad: "M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" },
  browser: { pad: "M3 5h18v14H3zM3 9h18M6 7h.01M8.5 7h.01" },
} as const;

type VormNaam = keyof typeof V;

/**
 * Welk teken hoort bij deze waarde?
 *
 * Op stukjes tekst matchen en niet op gelijkheid, want dezelfde bron komt in
 * meer gedaanten binnen: als hostnaam (m.facebook.com, l.facebook.com) en als
 * utm-waarde (facebook, facebook-SiteLink, tw_source=fb).
 */
export function kiesVorm(dim: string, waarde: string): VormNaam | null {
  const w = (waarde || "").toLowerCase();
  const heeft = (...delen: string[]) => delen.some((d) => w.includes(d));

  if (dim === "device") {
    if (w === "mobile") return "mobiel";
    if (w === "desktop") return "desktop";
    if (w === "tablet") return "tablet";
    return null;
  }

  if (dim === "os") {
    if (heeft("ios", "mac")) return "appel";
    if (heeft("android")) return "android";
    if (heeft("windows")) return "windows";
    if (heeft("chrome os")) return "chromeos";
    if (heeft("linux", "ubuntu")) return "linux";
    return null;
  }

  if (dim === "browser") {
    if (heeft("safari")) return "appel";
    if (heeft("android webview", "samsung")) return "android";
    if (heeft("edge")) return "windows";
    if (heeft("chrome")) return "chromeos";
    return "browser";
  }

  /* bron, utm_source, utm_medium en utm_campaign delen dezelfde waarden. */
  if (heeft("facebook", "fb.", "=fb", "fbclid")) return "facebook";
  if (heeft("instagram", "=ig", "ig.")) return "instagram";
  if (heeft("tiktok", "ttclid")) return "tiktok";
  if (heeft("youtube")) return "youtube";
  if (heeft("google", "gmail", "adwords")) return "google";
  if (heeft("bing", "duckduckgo", "ecosia", "yahoo")) return "zoeken";
  if (heeft("klaviyo", "klclick", "mail", "email", "newsletter")) return "mail";
  if (heeft("shopify", "shop_app", "shop app")) return "shopify";
  if (w === "direct" || w === "(direct)" || heeft("none")) return "direct";
  if (heeft("herbies.co")) return "eigen";
  return null;
}

/**
 * Het teken vóór een naam in de lijst.
 *
 * Geeft null terug als er niets passends is. Bewust geen vraagteken of
 * grijs bolletje als vervanging: een teken dat niets zegt kost dezelfde
 * ruimte als een teken dat wel iets zegt, en maakt de kolom alleen maar
 * rommeliger.
 */
export function Icoon({ dim, naam }: { dim: string; naam: string }) {
  if (dim === "country") {
    const v = vlag(naam);
    return v ? <span className="balkrij__vlag" aria-hidden="true">{v}</span> : null;
  }

  const naamVorm = kiesVorm(dim, naam);
  if (!naamVorm) return null;
  const vorm = V[naamVorm] as { pad: string; vul?: boolean; kleur?: string };

  return (
    <svg
      className="balkrij__icoon"
      viewBox="0 0 24 24"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
      {...(vorm.vul
        ? { fill: vorm.kleur || "currentColor", stroke: "none" }
        : {
            fill: "none",
            stroke: vorm.kleur || "currentColor",
            strokeWidth: 1.7,
            strokeLinecap: "round" as const,
            strokeLinejoin: "round" as const,
          })}
    >
      <path d={vorm.pad} />
    </svg>
  );
}
