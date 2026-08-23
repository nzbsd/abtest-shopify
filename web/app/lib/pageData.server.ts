import supabase from "~/db.server";
import { configProbleem } from "./dashboardAuth.server";
import {
  lijstProducten, loadTests, matchVariants, resolveProduct, type ProductInfo, type PriceTest,
} from "./priceTest.server";
import type { DagRij, DekkingRij, DeviceRij, StatRij } from "./analytics";
import { bundleProductIds, preflight, type Bevinding } from "./preflight.server";
import { normaliseerPad, type TestType } from "./testTypes";
import {
  themaLijst, themaLijstMetSnippet, productTemplates, snippetInThema,
  type ThemaInfo, type TemplateInfo,
} from "./themes.server";
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
): Promise<BasisData & { daily: DagRij[]; devices: DeviceRij[]; dekking: DekkingRij[]; orders: Record<number, OrderResultaat> }> {
  const leeg = { tests: [], stats: [], daily: [], devices: [], dekking: [], orders: {} };
  const { fout } = await shopOfFout(shop);
  if (fout || !shop) return { shop: null, fout, ...leeg };

  try {
    const [tests, stats, daily, devices, dekking] = await Promise.all([
      loadTests(shop),
      supabase.from("price_test_stats").select("*").eq("shop", shop),
      supabase.from("price_test_daily").select("*").eq("shop", shop).order("dag"),
      // Mag falen zonder het scherm mee te nemen: de view is later toegevoegd
      // en een database die de migratie nog niet heeft gehad hoort geen leeg
      // analyticsscherm op te leveren.
      supabase.from("price_test_devices").select("*").eq("shop", shop),
      supabase.from("price_test_device_dekking").select("*").eq("shop", shop),
    ]);
    return {
      shop,
      fout: null,
      tests,
      stats: (stats.data || []) as StatRij[],
      daily: (daily.data || []) as DagRij[],
      devices: (devices.data || []) as DeviceRij[],
      dekking: (dekking.data || []) as DekkingRij[],
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
): Promise<{
  shop: string | null; fout: string | null; tests: PriceTest[]; producten: ProductInfo[];
  winkelUrl: string | null; themas: ThemaInfo[]; templates: TemplateInfo[];
}> {
  const leegAntwoord = {
    tests: [] as PriceTest[], producten: [] as ProductInfo[], winkelUrl: null,
    themas: [] as ThemaInfo[], templates: [] as TemplateInfo[],
  };

  const { fout } = await shopOfFout(shop);
  if (fout || !shop) return { shop: null, fout, ...leegAntwoord };

  try {
    // De productenlijst mag falen zonder dat het scherm omvalt: zonder Shopify
    // kun je geen nieuwe test aanmaken, maar bestaande tests wél stoppen. Dat
    // is precies het moment waarop je die knop nodig hebt.
    //
    // Voor thema's geldt hetzelfde, en daar is het waarschijnlijker: read_themes
    // is later toegevoegd, dus een winkel die de scope nog niet goedgekeurd
    // heeft krijgt een lege lijst in plaats van een kapot scherm.
    const [tests, producten, winkelUrl, themas] = await Promise.all([
      loadTests(shop),
      lijstProducten(admin).catch(() => [] as ProductInfo[]),
      winkelDomein(admin).catch(() => null),
      themaLijstMetSnippet(admin).catch(() => [] as ThemaInfo[]),
    ]);

    // Templates komen uit het live thema: dat is het thema waarop de
    // template-test draait, dus een suffix uit een ander thema zou nergens
    // bestaan.
    const live = themas.find((t) => t.rol === "MAIN");
    const templates = live
      ? await productTemplates(admin, live.id).catch(() => [] as TemplateInfo[])
      : [];

    return { shop, fout: null, tests, producten, winkelUrl, themas, templates };
  } catch (e: any) {
    return { shop, fout: e?.message ?? "Database error", ...leegAntwoord };
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
      const type = String(form.get("testType") || "price") as TestType;
      const split = parseInt(String(form.get("split") || "50"), 10);
      if (!Number.isFinite(split) || split < 1 || split > 99) {
        throw new Error("Percentage must be between 1 and 99.");
      }

      const lijst = (veld: string) =>
        String(form.get(veld) || "").split(",").map((s) => s.trim()).filter(Boolean);

      const conf = parseInt(String(form.get("confidence") || "95"), 10);
      const mde = parseFloat(String(form.get("mde") || ""));

      const gedeeld = {
        shop,
        test_type: type,
        naam: String(form.get("naam") || "").trim() || null,
        hypothese: String(form.get("hypothese") || "").trim() || null,
        split_pct: split,
        primary_metric: String(form.get("primaryMetric") || "rpv"),
        // De hoofdmetriek kan nooit ook guardrail zijn: dan zou hij zichzelf
        // moeten bewaken, en één slecht getal twee keer meetellen.
        guardrails: lijst("guardrails").filter((g) => g !== String(form.get("primaryMetric") || "rpv")),
        confidence_pct: [90, 95, 99].includes(conf) ? conf : 95,
        mde_pct: Number.isFinite(mde) && mde > 0 ? mde : null,
        target_devices: lijst("targetDevices"),
        target_countries: lijst("targetCountries").map((c) => c.toUpperCase()),
        is_subscription: String(form.get("isSubscription") || "") === "1",
        avg_cycles: parseFloat(String(form.get("cycles") || "")) || null,
      };

      let rij: any;
      let bericht = "";

      if (type === "theme") {
        const themeId = String(form.get("themeId") || "").trim();
        const themeName = String(form.get("themeName") || "").trim();
        if (!themeId) throw new Error("No theme chosen.");
        rij = {
          ...gedeeld,
          test_theme_id: themeId,
          test_theme_name: themeName || null,
          // Geen product en geen pad: een thema-test hangt aan de hele winkel.
          control_product_id: null,
          test_product_id: null,
        };
        bericht = "Test saved: live theme against " + (themeName || "the chosen theme") + ".";
      } else if (type === "url") {
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
    if (intent === "start" || intent === "stop") {
      const id = Number(form.get("id"));

      // Starten splitst echt verkeer, dus eerst controleren. Stoppen wordt
      // nooit geblokkeerd: als er iets mis is, ís stoppen de oplossing.
      if (intent === "start" && String(form.get("force") || "") !== "1") {
        const { data: rij } = await supabase
          .from("price_tests")
          .select(
            "test_type, control_product_id, test_product_id, template_suffix, " +
            "test_theme_id, test_theme_name",
          )
          .eq("id", id).eq("shop", shop).maybeSingle<{
            test_type: string | null;
            control_product_id: string | null;
            test_product_id: string | null;
            template_suffix: string | null;
            test_theme_id: string | null;
            test_theme_name: string | null;
          }>();

        const soort = String(rij?.test_type || "price");

        /**
         * Thema-test: staat het snippet in het testthema?
         *
         * Zonder snippet browst de testgroep dat thema zonder ooit gemeten te
         * worden. Het dashboard laat dan verkeer aan één kant zien, en dat
         * leest als "de variant converteert niets" terwijl er niets geteld
         * wordt. Dat is precies het soort stille mislukking waar een test
         * dagen aan verspilt.
         */
        if (rij && soort === "theme" && rij.test_theme_id) {
          const heeft = await snippetInThema(admin, String(rij.test_theme_id));
          if (heeft === false) {
            return {
              ok: false,
              bericht:
                "Not started — the theme \"" + (rij.test_theme_name || "you chose") + "\" does " +
                "not have the Experli snippet. The test group would browse it without ever " +
                "being measured. Add the snippet to that theme, then start again.",
            };
          }
        }

        /**
         * Template-test: bestaat die suffix echt?
         *
         * Een onbekende ?view= faalt niet zichtbaar - Shopify valt terug op de
         * standaardpagina. Beide groepen zien dan hetzelfde en de test meet
         * netjes een verschil van nul.
         */
        if (rij && soort === "template" && rij.template_suffix) {
          const themas = await themaLijst(admin).catch(() => [] as ThemaInfo[]);
          const live = themas.find((t) => t.rol === "MAIN");
          const lijst = live
            ? await productTemplates(admin, live.id).catch(() => [] as TemplateInfo[])
            : [];
          if (lijst.length && !lijst.some((t) => t.suffix === rij.template_suffix)) {
            return {
              ok: false,
              bericht:
                "Not started — your live theme has no template called product." +
                rij.template_suffix + ". Shopify would quietly serve the default page instead, " +
                "so both groups would see exactly the same thing.",
            };
          }
        }

        // De productcontrole vergelijkt twee producten met elkaar en slaat dus
        // alleen op een prijstest; bij de andere types is er hooguit één.
        if (rij && soort === "price" && rij.control_product_id && rij.test_product_id) {
          const [control, test, bundelIds] = await Promise.all([
            resolveProduct(admin, rij.control_product_id),
            resolveProduct(admin, rij.test_product_id),
            bundleProductIds(),
          ]);

          if (control && test) {
            const bevindingen = preflight({
              control,
              test,
              controlSellingPlans: control.sellingPlanGroups ?? 0,
              testSellingPlans: test.sellingPlanGroups ?? 0,
              bundleProductIds: bundelIds,
            });
            const blokkerend = bevindingen.filter((b) => b.niveau === "block");
            if (blokkerend.length) {
              return {
                ok: false,
                bericht:
                  "Not started — " + blokkerend.length + " problem(s) would make this test " +
                  "meaningless or cost you money:\n\n" +
                  blokkerend.map((b) => "• " + b.titel + ". " + b.uitleg).join("\n\n"),
                bevindingen,
              };
            }
            if (bevindingen.length) {
              // Waarschuwingen blokkeren niet, maar reizen wel mee terug zodat
              // het scherm ze naast de gestarte test kan tonen.
              const nieuw = {
                status: "running", started_at: new Date().toISOString(), stopped_at: null,
              };
              const { error } = await supabase
                .from("price_tests").update(nieuw).eq("id", id).eq("shop", shop);
              if (error) throw new Error(error.message);
              return {
                ok: true,
                bericht: "Test started, with " + bevindingen.length + " thing(s) worth checking.",
                bevindingen,
              };
            }
          }
        }
      }

      const nieuw = intent === "start"
        ? { status: "running", started_at: new Date().toISOString(), stopped_at: null }
        : { status: "stopped", stopped_at: new Date().toISOString() };
      const { error } = await supabase.from("price_tests").update(nieuw).eq("id", id).eq("shop", shop);
      if (error) throw new Error(error.message);
      return {
        ok: true,
        bericht: intent === "start"
          ? "Test started. Part of your traffic now gets the variant."
          : "Test stopped. Everyone sees the original again.",
      };
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
