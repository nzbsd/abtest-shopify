/**
 * Filters op het bezoekersscherm.
 *
 * WAAROM DIT DE KERN IS
 * Zonder filters is elk lijstje een dood eindpunt: je ziet dát Safari 40% is
 * en dan houdt het op. Met filters wordt elke rij een vraag - "en hoe gedraagt
 * die 40% zich dan?" - en herrekent het hele scherm eronder, inclusief de
 * trechter. Dat is het verschil tussen een rapport en een gereedschap.
 *
 * Dit kan alleen omdat een sessie één rij is met alle dimensies erop. Waren
 * het losse events per dimensie geweest, dan was "bounce rate van Safari op
 * mobiel uit Duitsland" een join over drie tabellen; nu is het een where.
 *
 * De dagtotalen kunnen dit níét - die zijn per dimensie opgeteld, dus daarin
 * bestaat de combinatie niet meer. Zodra er een filter aan staat komt alles
 * daarom uit de sessietabel, en die reikt dertig dagen terug. Het scherm zegt
 * dat ook wanneer je verder terugkijkt dan dat.
 */

export type FilterSleutel =
  | "device" | "browser" | "os" | "country"
  | "bron" | "utm_source" | "utm_medium" | "utm_campaign"
  | "pad" | "instap" | "uitstap"
  | "nieuw";

export type Filter = { sleutel: FilterSleutel; waarde: string };

/** Hoe een filter in het scherm heet. */
export const FILTER_LABEL: Record<FilterSleutel, string> = {
  device: "Device",
  browser: "Browser",
  os: "OS",
  country: "Country",
  bron: "Source",
  utm_source: "UTM source",
  utm_medium: "UTM medium",
  utm_campaign: "Campaign",
  pad: "Page",
  instap: "Entry page",
  uitstap: "Exit page",
  nieuw: "Visitor",
};

/**
 * Filters in en uit de URL.
 *
 * In de URL en niet in state, zodat een gefilterde weergave een link is die
 * je kunt bewaren of doorsturen. Dat is ook waarom de vorm zo kort is: een
 * URL met vier filters moet nog leesbaar zijn.
 *
 * Vorm: ?f=device:mobile,browser:Safari
 * Waarden met een komma of dubbele punt komen niet voor in deze dimensies -
 * het zijn apparaatnamen, landcodes en paden - maar ze worden wel gecodeerd,
 * want "niet voorkomen" is geen garantie.
 */
export function leesFilters(ruw: string | null): Filter[] {
  if (!ruw) return [];
  return ruw
    .split(",")
    .map((deel) => {
      const i = deel.indexOf(":");
      if (i < 1) return null;
      const sleutel = deel.slice(0, i) as FilterSleutel;
      if (!(sleutel in FILTER_LABEL)) return null;
      const waarde = decodeURIComponent(deel.slice(i + 1));
      return waarde ? { sleutel, waarde } : null;
    })
    .filter(Boolean)
    .slice(0, 8) as Filter[];   // acht is ruim; meer is een vergissing
}

export function schrijfFilters(filters: Filter[]): string {
  return filters
    .map((f) => f.sleutel + ":" + encodeURIComponent(f.waarde))
    .join(",");
}

/** Filter erbij, of eruit als hij er al precies zo op staat. */
export function wisselFilter(huidig: Filter[], nieuw: Filter): Filter[] {
  const zelfde = (a: Filter, b: Filter) => a.sleutel === b.sleutel && a.waarde === b.waarde;
  if (huidig.some((f) => zelfde(f, nieuw))) {
    return huidig.filter((f) => !zelfde(f, nieuw));
  }
  // Eén waarde per sleutel: twee devices tegelijk filteren geeft altijd nul
  // sessies, en dat leest als "geen data" in plaats van als een onmogelijke
  // vraag.
  return [...huidig.filter((f) => f.sleutel !== nieuw.sleutel), nieuw];
}

/**
 * Past een sessierij binnen de filters?
 *
 * In JavaScript en niet in SQL, omdat het scherm de sessies toch al ophaalt
 * voor de dagreeks en de trechter. Twee keer dezelfde rijen halen - één keer
 * gefilterd, één keer niet - kost een extra ronde naar de database voor iets
 * wat hier een enkele lus is.
 */
export function past(rij: any, filters: Filter[]): boolean {
  for (const f of filters) {
    const w = f.waarde;
    switch (f.sleutel) {
      case "device":       if ((rij.device || "unknown") !== w) return false; break;
      case "browser":      if ((rij.browser || "unknown") !== w) return false; break;
      case "os":           if ((rij.os || "unknown") !== w) return false; break;
      case "country":      if ((rij.country || "??") !== w) return false; break;
      case "utm_source":   if ((rij.utm_source || "") !== w) return false; break;
      case "utm_medium":   if ((rij.utm_medium || "") !== w) return false; break;
      case "utm_campaign": if ((rij.utm_campaign || "") !== w) return false; break;
      case "instap":       if ((rij.instap || "") !== w) return false; break;
      case "uitstap":      if ((rij.uitstap || "") !== w) return false; break;
      case "nieuw":        if ((rij.nieuw ? "new" : "returning") !== w) return false; break;
      case "bron":
        if ((rij.utm_source || rij.verwijzer || "direct") !== w) return false;
        break;
      case "pad":
        // Bezocht deze sessie die pagina ergens onderweg? Niet "eindigde erop"
        // of "begon ermee" - daar zijn instap en uitstap voor.
        if (!Array.isArray(rij.paden) || !rij.paden.includes(w)) return false;
        break;
    }
  }
  return true;
}
