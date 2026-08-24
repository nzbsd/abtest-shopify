import supabase from "~/db.server";

/**
 * Het levende deel van het bezoekersscherm.
 *
 * WAAROM DIT LOS STAAT VAN siteData
 * Dat is één query over de hele gekozen periode - vierduizend sessies uitklappen
 * naar elf dimensies, pagina's, routes, de tijdreeks. Driehonderdvijftig
 * milliseconde, en terecht: je vraagt er ook alles voor op.
 *
 * Dit is een andere vraag: wie is er nu. Drie indexscans over het laatste half
 * uur, drie milliseconde. Dat mag elke vijftien seconden; het andere niet, en
 * daarom is "63 online" tot nu toe een momentopname geweest die pas veranderde
 * als je ververste - op een scherm dat over dit moment gaat.
 */

export type LiveLand = { land: string; actief: number };
export type LiveOrder = { land: string; cents: number; op: string };

export type LiveData = {
  nu: number;
  landen: LiveLand[];
  /** Orders sinds het meegegeven moment. Leeg bij de eerste vraag. */
  orders: LiveOrder[];
  /** Waar de winkel zelf staat, voor de boog van bezoeker naar winkel. */
  winkelLand: string | null;
  /** Servertijd; gaat mee terug als `sinds` bij de volgende vraag. */
  op: string;
};

export async function liveData(shop: string, sinds: string | null): Promise<LiveData> {
  const { data } = await supabase.rpc("site_live", {
    p_shop: shop,
    // Bij de eerste vraag geen tijdstip: dan is er ook geen "sinds", en een
    // stortvloed aan oude orders bij het openen is geen nieuws maar ruis.
    p_sinds: sinds || null,
  });

  const o = (data ?? {}) as any;
  return {
    nu: Number(o.nu) || 0,
    landen: ((o.landen ?? []) as any[]).map((r) => ({
      land: String(r.land), actief: Number(r.actief) || 0,
    })),
    orders: ((o.orders ?? []) as any[]).map((r) => ({
      land: String(r.land), cents: Number(r.cents) || 0, op: String(r.op),
    })),
    winkelLand: o.winkelLand ? String(o.winkelLand) : null,
    op: String(o.op ?? new Date().toISOString()),
  };
}

/**
 * Waar de winkel staat, één keer per dag bij Shopify opgehaald.
 *
 * Alleen de app-schil kan dit vragen - het losse dashboard heeft geen
 * admin-verbinding - dus het antwoord gaat naar de database en beide schillen
 * lezen het daar. Mislukken mag: dan zijn er geen bogen, en verder niets.
 */
export async function bewaarWinkelLand(admin: any, shop: string): Promise<void> {
  try {
    const { data: bestaat } = await supabase
      .from("site_winkel").select("bijgewerkt").eq("shop", shop).maybeSingle();
    if (bestaat?.bijgewerkt && Date.now() - new Date(bestaat.bijgewerkt).getTime() < 86_400_000) return;

    const antwoord = await admin.graphql(
      `#graphql
       query ExperliShopLand { shop { billingAddress { countryCodeV2 } } }`,
    );
    const body = await antwoord.json();
    const land = body?.data?.shop?.billingAddress?.countryCodeV2;
    if (!land) return;

    await supabase.from("site_winkel")
      .upsert({ shop, land: String(land), bijgewerkt: new Date().toISOString() }, { onConflict: "shop" });
  } catch {
    // Geen land betekent geen bogen. Dat is geen reden om het scherm op te houden.
  }
}
