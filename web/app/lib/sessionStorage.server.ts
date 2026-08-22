import type { SessionStorage } from "@shopify/shopify-app-session-storage";
import { Session } from "@shopify/shopify-api";
import supabase from "~/db.server";

const TABLE = "price_test_sessions";

export class SupabaseSessionStorage implements SessionStorage {
  async storeSession(session: Session): Promise<boolean> {
    const entries = session.toPropertyArray(true);
    const expires =
      session.expires instanceof Date ? session.expires.toISOString() : null;

    const { error } = await supabase.from(TABLE).upsert(
      {
        id: session.id,
        shop: session.shop,
        data: entries,
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
    return Session.fromPropertyArray(data.data as [string, any][], true);
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
    return (data ?? []).map((row: any) =>
      Session.fromPropertyArray(row.data as [string, any][], true),
    );
  }
}
