import supabase from "~/db.server";
import { configProbleem } from "./dashboardAuth.server";
import {
  lijstProducten, loadTests, matchVariants, resolveProduct, type ProductInfo, type PriceTest,
} from "./priceTest.server";
import type { DagRij, StatRij } from "./analytics";

/**
 * De gegevens achter de schermen, één keer.
 *
 * Het ingebedde scherm in Shopify en het losse dashboard tonen dezelfde
 * componenten en moeten dus ook dezelfde gegevens krijgen. Twee sets loaders
 * zouden na de eerste wijziging al uit elkaar lopen, en dan geeft dezelfde
 * vraag op twee plekken een ander antwoord.
 *
 * Fouten komen terug als waarde en niet als uitzondering: een ontbrekende
 * omgevingsvariabele hoort een leesbare melding op het scherm te worden, geen
 * leeg foutscherm.
 */

export type BasisData = {
  shop: string | null;
  fout: string | null;
  tests: PriceTest[];
  stats: StatRij[];
};

async function shopOfFout(shop: string | null): Promise<{ fout: string | null }> {
  const probleem = configProbleem();
  if (probleem) return { fout: probleem };
  if (!shop) return { fout: null };
  return { fout: null };
}

export async function overzichtData(shop: string | null): Promise<BasisData> {
  const { fout } = await shopOfFout(shop);
  if (fout || !shop) return { shop: null, fout, tests: [], stats: [] };

  try {
    const [tests, stats] = await Promise.all([
      loadTests(shop),
      supabase.from("price_test_stats").select("*").eq("shop", shop),
    ]);
    return { shop, fout: null, tests, stats: (stats.data || []) as StatRij[] };
  } catch (e: any) {
    return { shop, fout: e?.message ?? "Databasefout", tests: [], stats: [] };
  }
}

export async function analyticsData(shop: string | null): Promise<BasisData & { daily: DagRij[] }> {
  const { fout } = await shopOfFout(shop);
  if (fout || !shop) return { shop: null, fout, tests: [], stats: [], daily: [] };

  try {
    const [tests, stats, daily] = await Promise.all([
      loadTests(shop),
      supabase.from("price_test_stats").select("*").eq("shop", shop),
      supabase.from("price_test_daily").select("*").eq("shop", shop).order("dag"),
    ]);
    return {
      shop,
      fout: null,
      tests,
      stats: (stats.data || []) as StatRij[],
      daily: (daily.data || []) as DagRij[],
    };
  } catch (e: any) {
    return { shop, fout: e?.message ?? "Databasefout", tests: [], stats: [], daily: [] };
  }
}

export async function testsData(
  admin: any,
  shop: string | null,
): Promise<{ shop: string | null; fout: string | null; tests: PriceTest[]; producten: ProductInfo[] }> {
  const { fout } = await shopOfFout(shop);
  if (fout || !shop) return { shop: null, fout, tests: [], producten: [] };

  try {
    // De productenlijst mag falen zonder dat het scherm omvalt: zonder Shopify
    // kun je geen nieuwe test aanmaken, maar bestaande tests wél stoppen. Dat
    // is precies het moment waarop je die knop nodig hebt.
    const [tests, producten] = await Promise.all([
      loadTests(shop),
      lijstProducten(admin).catch(() => [] as ProductInfo[]),
    ]);
    return { shop, fout: null, tests, producten };
  } catch (e: any) {
    return { shop, fout: e?.message ?? "Databasefout", tests: [], producten: [] };
  }
}

/** De acties van het instelscherm: aanmaken, starten, stoppen, verwijderen. */
export async function testsAction(
  admin: any,
  shop: string | null,
  form: FormData,
): Promise<{ ok: boolean; bericht: string }> {
  if (!shop) return { ok: false, bericht: "Geen winkel gekoppeld." };
  const intent = String(form.get("intent") || "");

  try {
    if (intent === "save") {
      const control = await resolveProduct(admin, String(form.get("control") || ""));
      if (!control) throw new Error("Origineel product niet gevonden.");
      const test = await resolveProduct(admin, String(form.get("test") || ""));
      if (!test) throw new Error("Duplicaat niet gevonden.");
      if (control.id === test.id) throw new Error("Origineel en duplicaat zijn hetzelfde product.");

      // Opnieuw koppelen op de server, met exact dezelfde functie als het
      // scherm gebruikte. Wat de browser stuurde vertrouwen we niet; wat we
      // opslaan moet uit de echte productgegevens komen.
      const { pairs, unmatched } = matchVariants(control, test);
      if (!pairs.length) throw new Error("Geen enkele variant kon gekoppeld worden.");

      const split = parseInt(String(form.get("split") || "50"), 10);
      if (!Number.isFinite(split) || split < 1 || split > 99) {
        throw new Error("Percentage moet tussen 1 en 99 liggen.");
      }

      const { error } = await supabase.from("price_tests").insert({
        shop,
        control_product_id: control.id,
        control_title: control.title,
        test_product_id: test.id,
        test_product_handle: test.handle,
        test_title: test.title,
        variant_map: pairs,
        split_pct: split,
      });
      if (error) throw new Error(error.message);

      let bericht = "Test opgeslagen: " + pairs.length + " variant(en) gekoppeld.";
      if (unmatched.length) bericht += " Buiten de test: " + unmatched.join(", ") + ".";
      return { ok: true, bericht };
    }

    if (intent === "start" || intent === "stop") {
      const id = Number(form.get("id"));
      const nieuw = intent === "start"
        ? { status: "running", started_at: new Date().toISOString(), stopped_at: null }
        : { status: "stopped", stopped_at: new Date().toISOString() };
      const { error } = await supabase.from("price_tests").update(nieuw).eq("id", id).eq("shop", shop);
      if (error) throw new Error(error.message);
      return {
        ok: true,
        bericht: intent === "start"
          ? "Test gestart. De testgroep krijgt vanaf nu het duplicaat te zien."
          : "Test gestopt. Iedereen ziet weer het origineel.",
      };
    }

    if (intent === "delete") {
      const id = Number(form.get("id"));
      const { error } = await supabase.from("price_tests").delete().eq("id", id).eq("shop", shop);
      if (error) throw new Error(error.message);
      return { ok: true, bericht: "Test verwijderd." };
    }

    return { ok: false, bericht: "Onbekende actie." };
  } catch (e: any) {
    return { ok: false, bericht: e?.message ?? "Er ging iets mis." };
  }
}
