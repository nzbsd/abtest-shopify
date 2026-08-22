import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { useState } from "react";
import supabase from "~/db.server";
import { unauthenticated } from "~/shopify.server";
import { vereisLogin, winkelDomein } from "~/lib/dashboardAuth.server";
import { loadTests, matchVariants, resolveProduct, type PriceTest } from "~/lib/priceTest.server";

export const meta = () => [{ title: "Tests · Price Test" }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await vereisLogin(request);
  const shop = await winkelDomein();
  return json({ shop, tests: shop ? await loadTests(shop) : [] });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  await vereisLogin(request);
  const shop = await winkelDomein();
  if (!shop) return json({ ok: false, bericht: "Geen winkel gekoppeld." }, { status: 400 });

  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  try {
    if (intent === "save") {
      const { admin } = await unauthenticated.admin(shop);

      const control = await resolveProduct(admin, String(form.get("control") || ""));
      if (!control) throw new Error("Origineel product niet gevonden.");
      const test = await resolveProduct(admin, String(form.get("test") || ""));
      if (!test) throw new Error("Duplicaat niet gevonden.");
      if (control.id === test.id) throw new Error("Origineel en duplicaat zijn hetzelfde product.");

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

      // Prijsvergelijking als waarschuwing, niet als blokkade: een test met een
      // LAGERE prijs is legitiem, een test met dezelfde prijs meet niets.
      const zelfdePrijs = pairs.every((p) => {
        const cv = control.variants.find((v) => v.num === p.control_num);
        const tv = test.variants.find((v) => v.num === p.test_num);
        return cv && tv && parseFloat(cv.price) === parseFloat(tv.price);
      });

      let bericht = "Test opgeslagen: " + pairs.length + " variant(en) gekoppeld.";
      if (unmatched.length) {
        bericht += " Niet gekoppeld en dus buiten de test: " + unmatched.join(", ") + ".";
      }
      if (zelfdePrijs) {
        bericht += " Let op: beide producten hebben dezelfde prijs, zo meet je niets.";
      }
      return json({ ok: true, bericht });
    }

    if (intent === "start" || intent === "stop") {
      const id = Number(form.get("id"));
      const nieuw = intent === "start"
        ? { status: "running", started_at: new Date().toISOString(), stopped_at: null }
        : { status: "stopped", stopped_at: new Date().toISOString() };
      const { error } = await supabase
        .from("price_tests").update(nieuw).eq("id", id).eq("shop", shop);
      if (error) throw new Error(error.message);
      return json({
        ok: true,
        bericht: intent === "start"
          ? "Test gestart. De testgroep ziet vanaf nu het duplicaat."
          : "Test gestopt. Iedereen ziet weer het origineel.",
      });
    }

    if (intent === "delete") {
      const id = Number(form.get("id"));
      const { error } = await supabase
        .from("price_tests").delete().eq("id", id).eq("shop", shop);
      if (error) throw new Error(error.message);
      return json({ ok: true, bericht: "Test verwijderd." });
    }

    return json({ ok: false, bericht: "Onbekende actie." }, { status: 400 });
  } catch (e: any) {
    return json({ ok: false, bericht: e?.message ?? "Er ging iets mis." }, { status: 500 });
  }
};

export default function Tests() {
  const { shop, tests } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  const nav = useNavigation();
  const bezig = nav.state !== "idle";
  const [open, setOpen] = useState(false);

  return (
    <main className="page">
      <div className="page__head">
        <div>
          <h1>Tests</h1>
          <p className="sub">Welk product tegen welk duplicaat, en hoe het verkeer verdeeld wordt.</p>
        </div>
        <button className="btn btn--primary" onClick={() => setOpen((v) => !v)}>
          {open ? "Annuleren" : "Nieuwe test"}
        </button>
      </div>

      {!shop && (
        <div className="banner banner--warn">
          <strong>Nog geen winkel gekoppeld.</strong> Installeer de app in Shopify.
        </div>
      )}

      {data?.bericht && (
        <div className={"banner " + (data.ok ? "banner--ok" : "banner--error")}>{data.bericht}</div>
      )}

      {open && (
        <div className="card">
          <div className="card__head"><h2>Nieuwe test</h2></div>
          <div className="card__body">
            <div className="banner">
              Maak eerst in Shopify een duplicaat van het product en zet daar de nieuwe prijs op —
              per markt zoals je wilt. Koppel er ook je <strong>bundel, selling plan en reviews</strong> aan;
              vergeet je er een, dan meet je dát verschil in plaats van de prijs.
            </div>
            <Form method="post">
              <input type="hidden" name="intent" value="save" />
              <div className="row">
                <div className="field">
                  <label htmlFor="control">Origineel — controlegroep</label>
                  <input id="control" name="control" type="text" placeholder="herbies-oregano" />
                  <div className="field__hint">Handle, product-id of de URL van de productpagina.</div>
                </div>
                <div className="field">
                  <label htmlFor="test">Duplicaat — testgroep</label>
                  <input id="test" name="test" type="text" placeholder="herbies-oregano-b" />
                  <div className="field__hint">Het product met de andere prijs.</div>
                </div>
              </div>
              <div className="field" style={{ maxWidth: 260 }}>
                <label htmlFor="split">Percentage bezoekers in de testgroep</label>
                <input id="split" name="split" type="number" min={1} max={99} defaultValue={50} />
                <div className="field__hint">De rest is de controlegroep.</div>
              </div>
              <button className="btn btn--primary" type="submit" disabled={bezig}>
                {bezig ? "Bezig…" : "Opslaan"}
              </button>
            </Form>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card__head"><h2>Alle tests</h2></div>
        <div className="card__body card__body--flush">
          {!tests.length && (
            <div style={{ padding: 18 }} className="muted">Nog geen tests aangemaakt.</div>
          )}
          {(tests as PriceTest[]).map((t) => (
            <div className="test-row" key={t.id}>
              <div style={{ minWidth: 260 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <strong>{t.control_title || t.control_product_id}</strong>
                  <span className={"badge badge--" + t.status}>{t.status}</span>
                </div>
                <div className="pair">
                  <span className="legend__item"><span className="swatch swatch--control" />origineel</span>
                  <span className="pair__arrow">→</span>
                  <span className="legend__item">
                    <span className="swatch swatch--test" />
                    <code>{t.test_product_handle}</code>
                  </span>
                </div>
                <div className="test-row__meta">
                  {t.split_pct}% in de testgroep · {(t.variant_map || []).length} variant(en) gekoppeld
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {t.status === "running" ? (
                  <Form method="post">
                    <input type="hidden" name="intent" value="stop" />
                    <input type="hidden" name="id" value={t.id} />
                    <button className="btn btn--danger" type="submit" disabled={bezig}>Stoppen</button>
                  </Form>
                ) : (
                  <Form method="post">
                    <input type="hidden" name="intent" value="start" />
                    <input type="hidden" name="id" value={t.id} />
                    <button className="btn btn--primary" type="submit" disabled={bezig}>Starten</button>
                  </Form>
                )}
                {t.status !== "running" && (
                  <Form
                    method="post"
                    onSubmit={(e) => {
                      if (!confirm("Test en alle gemeten cijfers verwijderen?")) e.preventDefault();
                    }}
                  >
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="id" value={t.id} />
                    <button className="btn" type="submit" disabled={bezig}>Verwijderen</button>
                  </Form>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
