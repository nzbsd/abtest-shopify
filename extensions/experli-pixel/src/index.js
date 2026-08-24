import { register } from "@shopify/web-pixels-extension";

/**
 * Wat er in de kassa gebeurt.
 *
 * WAAROM DIT NAAST HET THEMA-SNIPPET STAAT
 * Het snippet in theme.liquid ziet de kassa niet: Shopify rendert daar geen
 * themacode. Alles tussen "checkout gestart" en "besteld" was daardoor een
 * zwart gat - bij deze winkel beginnen er vierentwintig mensen aan een cart en
 * lopen er dertien door, en waar die elf afhaken wisten we niet.
 *
 * Een web pixel draait wél op de kassa. En hij komt uit de app in plaats van
 * uit het thema, dus een thema-update gooit hem niet weg.
 *
 * WAAROM HET SNIPPET TOCH BLIJFT
 * De A/B-omschakeling moet gebeuren vóórdat de pagina schildert, en deze code
 * draait in een web worker die daar veel te laat voor is. Toewijzing en
 * pageviews blijven dus in het thema; dit is er alleen de kassa bij.
 *
 * TOESTEMMING
 * Web pixels honoreren de Customer Privacy API: in regio's waar toestemming
 * nodig is draait dit pas nádat die gegeven is. Dat betekent dat de aantallen
 * hier lager liggen dan wat het thema-snippet meet. Dat is geen fout in deze
 * code - het is wat er overblijft als je alleen telt wat je mag tellen.
 */

register(({ analytics, browser, settings }) => {
  const eindpunt = settings.endpoint;
  const shop = settings.shop;
  if (!eindpunt || !shop) return;

  /**
   * De ids uit de cookies van de winkel.
   *
   * Niet uit sessionStorage: dat is per tabblad en per herkomst, en deze code
   * draait in een sandbox. Het thema-snippet zet daarom hetzelfde sessie-id
   * ook in een cookie, en die kunnen we hier wel lezen.
   *
   * Zonder bezoekers-id sturen we niets. Een gebeurtenis die aan niemand hangt
   * is geen gegeven maar ruis, en hij zou een sessie aanmaken die nooit een
   * pageview heeft gehad.
   */
  const ids = async () => {
    const [vid, sid] = await Promise.all([
      browser.cookie.get("_pt_v"),
      browser.cookie.get("_pt_s"),
    ]);
    return vid && sid ? { vid, sid } : null;
  };

  /**
   * text/plain, net als de andere meetpunten.
   *
   * Een JSON-content-type dwingt een CORS-preflight af, en die kost een extra
   * rondje op een verbinding die net bezig is met afrekenen.
   */
  const stuur = async (soort, extra) => {
    try {
      const id = await ids();
      if (!id) return;
      await fetch(eindpunt, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        keepalive: true,
        body: JSON.stringify({ shop, sid: id.sid, vid: id.vid, t: soort, ...extra }),
      });
    } catch {
      // Een mislukte meting mag een afrekening nooit ophouden.
    }
  };

  // Wat het thema ook al ziet, maar dan officieel in plaats van door fetch te
  // onderscheppen. Onderscheppen werkt tot een thema-update of een andere app
  // ertussen komt; dit blijft werken.
  analytics.subscribe("product_added_to_cart", () => stuur("atc"));
  analytics.subscribe("checkout_started", () => stuur("checkout"));

  // En dit is nieuw: de stappen ín de kassa, waar het thema niet komt.
  analytics.subscribe("checkout_contact_info_submitted", () => stuur("contact"));
  analytics.subscribe("checkout_shipping_info_submitted", () => stuur("verzending"));
  analytics.subscribe("payment_info_submitted", () => stuur("betaling"));

  /**
   * De order komt hier niet vandaan.
   *
   * checkout_completed vuurt in de browser, en die kan wegklikken, een adblocker
   * hebben of de verbinding verliezen. Het bedrag komt van de orders/create-
   * webhook, die Shopify server-to-server stuurt en herhaalt tot hij aankomt.
   * Dit signaal is er alleen om te zien dat de trechter helemaal doorloopt.
   */
  analytics.subscribe("checkout_completed", () => stuur("afgerekend"));
});
