import type { SessionStorage } from "@shopify/shopify-app-session-storage";
import { Session } from "@shopify/shopify-api";
import supabase from "~/db.server";
import { maakOpen, sluitOp } from "./tokenKluis.server";

const TABLE = "price_test_sessions";

/**
 * Sessies in Supabase, met het toegangstoken versleuteld.
 *
 * Zie tokenKluis.server.ts voor waarom. Kort: de service-role-sleutel gaat
 * langs RLS heen, en die mag niet genoeg zijn om een winkel over te nemen.
 */
export class SupabaseSessionStorage implements SessionStorage {
  async storeSession(session: Session): Promise<boolean> {
    const entries = session.toPropertyArray(true);
    const expires =
      session.expires instanceof Date ? session.expires.toISOString() : null;

    const { error } = await supabase.from(TABLE).upsert(
      {
        id: session.id,
        shop: session.shop,
        data: sluitOp(entries as [string, any][]),
        expires,
      },
      { onConflict: "id" },
    );

    if (error) {
      console.error("[SupabaseSessionStorage] storeSession", error);
      return false;
    }
    return true;
  }

  async loadSession(id: string): Promise<Session | undefined> {
    const { data, error } = await supabase
      .from(TABLE)
      .select("data")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("[SupabaseSessionStorage] loadSession", error);
      return undefined;
    }
    if (!data) return undefined;

    const open = maakOpen(data.data as [string, any][]);
    if (!open) {
      // Onleesbaar - vrijwel zeker een geroteerd app-geheim. Doen alsof de
      // sessie er niet is: Shopify haalt er dan zelf een nieuwe, en die komt
      // versleuteld terug. Blijven zitten met een kapotte sessie zou de app
      // stilzetten tot iemand hem opnieuw installeert.
      console.error("[SupabaseSessionStorage] sessie onleesbaar, wordt opnieuw opgehaald", id);
      return undefined;
    }

    const sessie = Session.fromPropertyArray(open.velden, true);

    // Eenmalig: een rij van voor de versleuteling gaat er meteen versleuteld
    // weer in. Wachten op de volgende keer dat Shopify zelf een token
    // wegschrijft kan bij een offline token maanden duren.
    if (open.wasPlat) await this.storeSession(sessie);

    return sessie;
  }

  async deleteSession(id: string): Promise<boolean> {
    const { error } = await supabase.from(TABLE).delete().eq("id", id);
    if (error) {
      console.error("[SupabaseSessionStorage] deleteSession", error);
      return false;
    }
    return true;
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    if (ids.length === 0) return true;
    const { error } = await supabase.from(TABLE).delete().in("id", ids);
    if (error) {
      console.error("[SupabaseSessionStorage] deleteSessions", error);
      return false;
    }
    return true;
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    const { data, error } = await supabase
      .from(TABLE)
      .select("data")
      .eq("shop", shop);

    if (error) {
      console.error("[SupabaseSessionStorage] findSessionsByShop", error);
      return [];
    }

    // Een onleesbare sessie valt hier weg in plaats van de hele lijst mee te
    // nemen: de aanroeper vraagt om bruikbare sessies, niet om alles wat er
    // ooit stond.
    const uit: Session[] = [];
    for (const rij of data ?? []) {
      const open = maakOpen((rij as any).data as [string, any][]);
      if (!open) continue;
      uit.push(Session.fromPropertyArray(open.velden, true));
    }
    return uit;
  }
}
