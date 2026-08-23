import supabase from "~/db.server";
import { configProbleem } from "./dashboardAuth.server";
import {
  lijstProducten, loadTests, matchVariants, resolveProduct, type ProductInfo, type PriceTest,
} from "./priceTest.server";
import type { DagRij, StatRij } from "./analytics";
import { bundleProductIds, preflight, type Bevinding } from "./preflight.server";
import { normaliseerPad } from "./testTypes";
import { orderCijfers, type OrderResultaat } from "./orders.server";

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

export async function overzichtData(
  admin: any,
  shop: string | null,
): Promise<BasisData & { orders: Record<number, OrderResultaat> }> {
  const { fout } = await shopOfFout(shop);
  if (fout || !shop) return { shop: null, fout, tests: [], stats: [], orders: {} };

  try {
    const [tests, stats] = await Promise.all([
      loadTests(shop),
      supabase.from("price_test_stats").select("*").eq("shop", shop),
    ]);
    return {
      shop, fout: null, tests,
      stats: (stats.data || []) as StatRij[],
      orders: await ordersPerTest(admin, tests),
    };
  } catch (e: any) {
    return { shop, fout: e?.message ?? "Database error", tests: [], stats: [], orders: {} };
  }
}

/**
 * Ordercijfers per test, opgehaald bij Shopify.
 *
 * Faalt er een, dan blijft de rest staan: zonder Shopify kun je nog steeds
 * bezoekers en de opzet zien, en dat is beter dan een leeg scherm.
 */
async function ordersPerTest(
  admin: any,
  tests: PriceTest[],
): Promise<Record<number, OrderResultaat>> {
  if (!admin) return {};
  const uit: Record<number, OrderResultaat> = {};
  await Promise.all(
    tests.map(async (t) => {
      try { uit[t.id] = await orderCijfers(admin, t); } catch { /* laat deze test leeg */ }
    }),
  );
  return uit;
}

export async function analyticsData(
  admin: any,
  shop: string | null,
): Promise<BasisData & { daily: DagRij[]; orders: Record<number, OrderResultaat> }> {
  const leeg = { tests: [], stats: [], daily: [], orders: {} };
  const { fout } = await shopOfFout(shop);
  if (fout || !shop) return { shop: null, fout, ...leeg };

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
      orders: await ordersPerTest(admin, tests),
    };
  } catch (e: any) {
    return { shop, fout: e?.message ?? "Database error", ...leeg };
  }
}

/**
 * Het publieke domein van de winkel, voor previewlinks vanaf een opgeslagen
 * test. Producten uit de kiezer dragen hun eigen URL bij zich, maar een test
 * bewaart alleen handles - en die moeten ergens aan geplakt worden.
 */
async function winkelDomein(admin: any): Promise<string | null> {
  if (!admin) return null;
  const res: any = await admin.graphql(
    `#graphql
     query Winkel { shop { primaryDomain { url } } }`,
  );
  const j = await res.json();
  return j?.data?.shop?.primaryDomain?.url ?? null;
}

export async function testsData(
  admin: any,
  shop: string | null,
): Promise<{ shop: string | null; fout: string | null; tests: PriceTest[]; producten: ProductInfo[]; winkelUrl: string | null }> {
  const { fout } = await shopOfFout(shop);
  if (fout || !shop) return { shop: null, fout, tests: [], producten: [], winkelUrl: null };

  try {
    // De productenlijst mag falen zonder dat het scherm omvalt: zonder Shopify
    // kun je geen nieuwe test aanmaken, maar bestaande tests wél stoppen. Dat
    // is precies het moment waarop je die knop nodig hebt.
    const [tests, producten, winkelUrl] = await Promise.all([
      loadTests(shop),
      lijstProducten(admin).catch(() => [] as ProductInfo[]),
      winkelDomein(admin).catch(() => null),
    ]);
    return { shop, fout: null, tests, producten, winkelUrl };
  } catch (e: any) {
    return { shop, fout: e?.message ?? "Database error", tests: [], producten: [], winkelUrl: null };
  }
}

/** De acties van het instelscherm: aanmaken, starten, stoppen, verwijderen. */
export async function testsAction(
  admin: any,
  shop: string | null,
  form: FormData,
): Promise<{ ok: boolean; bericht: string; bevindingen?: Bevinding[] }> {
  if (!shop) return { ok: false, bericht: "No store connected." };
  const intent = String(form.get("intent") || "");

  try {
    if (intent === "save") {
      const type = String(form.get("testType") || "price") as "price" | "template" | "url";
      const split = parseInt(String(form.get("split") || "50"), 10);
      if (!Number.isFinite(split) || split < 1 || split > 99) {
        throw new Error("Percentage must be between 1 and 99.");
      }

      const gedeeld = {
        shop,
        test_type: type,
        naam: String(form.get("naam") || "").trim() || null,
        hypothese: String(form.get("hypothese") || "").trim() || null,
        split_pct: split,
        is_subscription: String(form.get("isSubscription") || "") === "1",
        avg_cycles: parseFloat(String(form.get("cycles") || "")) || null,
      };

      let rij: any;
      let bericht = "";

      if (type === "url") {
        const a = normaliseerPad(String(form.get("controlUrl") || ""));
        const b = normaliseerPad(String(form.get("testUrl") || ""));
        if (!a || !b) throw new Error("Both URLs are required.");
        if (a === b) throw new Error("The two URLs are the same.");
        rij = { ...gedeeld, control_product_id: a, control_url: a, test_url: b, test_product_id: null };
        bericht = "Test saved: " + a + " against " + b + ".";
      } else {
        const control = await resolveProduct(admin, String(form.get("control") || ""));
        if (!control) throw new Error("Product not found.");

        if (type === "template") {
          const suffix = String(form.get("templateSuffix") || "").trim();
          if (!suffix) throw new Error("Template suffix is required.");
          rij = {
            ...gedeeld,
            control_product_id: control.id,
            control_product_handle: control.handle,
            control_title: control.title,
            template_suffix: suffix,
            test_product_id: null,
          };
          bericht = "Test saved: " + control.title + " against template ?view=" + suffix + ".";
        } else {
          const test = await resolveProduct(admin, String(form.get("test") || ""));
          if (!test) throw new Error("Duplicate not found.");
          if (control.id === test.id) throw new Error("Original and duplicate are the same product.");

          // Opnieuw koppelen op de server met exact dezelfde functie als het
          // scherm gebruikte. Wat de browser stuurde vertrouwen we niet.
          const { pairs, unmatched } = matchVariants(control, test);
          if (!pairs.length) throw new Error("No variant could be matched.");

          rij = {
            ...gedeeld,
            control_product_id: control.id,
            control_product_handle: control.handle,
            control_title: control.title,
            test_product_id: test.id,
            test_product_handle: test.handle,
            test_title: test.title,
            variant_map: pairs,
          };
          bericht = "Test saved: " + pairs.length + " variant(s) matched.";
          if (unmatched.length) bericht += " Outside the test: " + unmatched.join(", ") + ".";
        }
      }

      const { error } = await supabase.from("price_tests").insert(rij);
      if (error) throw new Error(error.message);
      return { ok: true, bericht };
    }
    // Abonnementsinstellingen kunnen ook op een lopende test: ze veranderen
    // alleen hoe er gerekend wordt, niet wat bezoekers te zien krijgen.
    if (intent === "settings") {
      const id = Number(form.get("id"));
      const aan = String(form.get("isSubscription") || "") === "1";
      const cycles = parseFloat(String(form.get("cycles") || ""));

      if (aan && (!Number.isFinite(cycles) || cycles < 1 || cycles > 60)) {
        throw new Error("Average cycles must be between 1 and 60.");
      }

      const { error } = await supabase
        .from("price_tests")
        .update({ is_subscription: aan, avg_cycles: aan ? cycles : null })
        .eq("id", id).eq("shop", shop);
      if (error) throw new Error(error.message);
      return {
        ok: true,
        bericht: aan
          ? "Lifetime settings saved. The forecast now assumes " + cycles + " cycles per customer."
          : "Lifetime forecast turned off for this test.",
      };
    }

    if (intent === "delete") {
      const id = Number(form.get("id"));
      const { error } = await supabase.from("price_tests").delete().eq("id", id).eq("shop", shop);
      if (error) throw new Error(error.message);
      return { ok: true, bericht: "Test deleted." };
    }

    return { ok: false, bericht: "Unknown action." };
  } catch (e: any) {
    return { ok: false, bericht: e?.message ?? "Something went wrong." };
  }
}
