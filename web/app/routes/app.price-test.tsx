import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useState } from "react";
import {
  Page, Layout, Card, BlockStack, InlineStack, Text, Button, Badge, Banner,
  TextField, Select, Box, Divider, DataTable,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import supabase from "~/db.server";
import {
  applyTestPrices, revertTestPrices, buildFunctionConfig, writeFunctionConfig,
  loadTests, type MarketConfig, type PriceTest,
} from "~/lib/priceTest.server";

const DISCOUNT_NODE_ID_KEY = "PRICE_TEST_DISCOUNT_NODE_ID";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  // Markten met hun price list: dat koppel we nodig hebben om per markt een
  // vaste prijs te kunnen zetten. Markten zonder price list kunnen we niet
  // testen en tonen we daarom niet als optie.
  const res: any = await admin.graphql(`#graphql
    query Markets {
      priceLists(first: 30) {
        nodes {
          id currency
          catalog { ... on MarketCatalog { markets(first: 5) { nodes { name handle } } } }
        }
      }
    }`);
  const j = await res.json();

  const markets: { handle: string; name: string; currency: string; priceListId: string }[] = [];
  for (const pl of j?.data?.priceLists?.nodes || []) {
    for (const m of pl?.catalog?.markets?.nodes || []) {
      if (!m?.handle) continue;
      markets.push({ handle: m.handle, name: m.name, currency: pl.currency, priceListId: pl.id });
    }
  }

  return json({
    tests: await loadTests(session.shop),
    markets,
    discountConfigured: !!process.env[DISCOUNT_NODE_ID_KEY],
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  const discountNodeId = process.env[DISCOUNT_NODE_ID_KEY];

  try {
    if (intent === "save") {
      const markets: MarketConfig[] = JSON.parse(String(form.get("markets") || "[]"));
      // control_discount is afgeleid, niet ingevoerd: zo kan hij niet
      // afwijken van het verschil dat de klant daadwerkelijk ziet.
      for (const m of markets) {
        m.control_discount = Number((m.test_amount - m.baseline_amount).toFixed(2));
      }
      const row = {
        shop: session.shop,
        product_id: String(form.get("productId") || ""),
        product_title: String(form.get("productTitle") || ""),
        split_pct: parseInt(String(form.get("splitPct") || "50"), 10),
        markets,
      };
      const id = form.get("id");
      const q = id
        ? supabase.from("price_tests").update(row).eq("id", Number(id)).eq("shop", session.shop)
        : supabase.from("price_tests").insert(row);
      const { error } = await q;
      if (error) throw new Error(error.message);
      return json({ ok: true, message: "Opgeslagen" });
    }

    if (intent === "start" || intent === "stop") {
      if (!discountNodeId) {
        throw new Error(
          `Zet ${DISCOUNT_NODE_ID_KEY} in de omgeving (de id van de automatische korting), anders weet de Function niet welke config bij deze test hoort.`,
        );
      }
      const id = Number(form.get("id"));
      const { data: test, error } = await supabase
        .from("price_tests").select("*").eq("id", id).eq("shop", session.shop).maybeSingle();
      if (error) throw new Error(error.message);
      if (!test) throw new Error("Test niet gevonden");

      if (intent === "start") {
        // VOLGORDE IS BEWUST: eerst de korting configureren, dan pas de prijs
        // omhoog. Andersom zou er een venster zijn waarin de prijs verhoogd is
        // terwijl de controlegroep zijn teruggave nog niet krijgt — dan betaalt
        // iedereen even te veel.
        const alle = await loadTests(session.shop);
        const cfg = buildFunctionConfig(
          alle.map((t) => (t.id === id ? { ...t, status: "running" as const } : t)),
        );
        const w = await writeFunctionConfig(admin, discountNodeId, cfg);
        if (!w.ok) throw new Error(`Kortingconfig schrijven mislukt: ${w.error}`);

        const p = await applyTestPrices(admin, test.product_id, test.markets || []);
        if (!p.ok) {
          // Prijzen niet gelukt: config terugdraaien zodat we niet met een
          // halve toestand blijven zitten.
          await writeFunctionConfig(admin, discountNodeId, buildFunctionConfig(alle));
          throw new Error(`Prijzen zetten mislukt: ${p.error}`);
        }

        await supabase.from("price_tests")
          .update({ status: "running", started_at: new Date().toISOString(), stopped_at: null })
          .eq("id", id).eq("shop", session.shop);
        return json({ ok: true, message: "Test gestart" });
      }

      // STOPPEN: eerst de prijzen terug, dan pas de korting weghalen. Zou de
      // korting er eerder af gaan, dan betaalt de controlegroep even de
      // testprijs zonder teruggave.
      const r = await revertTestPrices(admin, test.product_id, test.markets || []);
      const alle = await loadTests(session.shop);
      const cfg = buildFunctionConfig(
        alle.map((t) => (t.id === id ? { ...t, status: "stopped" as const } : t)),
      );
      await writeFunctionConfig(admin, discountNodeId, cfg);
      await supabase.from("price_tests")
        .update({ status: "stopped", stopped_at: new Date().toISOString() })
        .eq("id", id).eq("shop", session.shop);

      return json({
        ok: r.ok,
        message: r.ok
          ? "Test gestopt, prijzen teruggezet"
          : `Test gestopt, maar niet elke markt kon terug: ${r.error} — controleer dit met spoed in Shopify.`,
      });
    }

    return json({ ok: false, message: "Onbekende actie" }, { status: 400 });
  } catch (e: any) {
    return json({ ok: false, message: e?.message ?? "Er ging iets mis" }, { status: 500 });
  }
};

export default function PriceTestPage() {
  const { tests, markets, discountConfigured } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ ok: boolean; message: string }>();
  const [productId, setProductId] = useState("");
  const [productTitle, setProductTitle] = useState("");
  const [splitPct, setSplitPct] = useState("50");
  const [rows, setRows] = useState<MarketConfig[]>([]);

  const addMarket = () => {
    const m = markets[0];
    if (!m) return;
    setRows([...rows, {
      market: m.handle, price_list_id: m.priceListId, currency: m.currency,
      baseline_amount: 0, test_amount: 0, control_discount: 0,
    }]);
  };

  const setRow = (i: number, patch: Partial<MarketConfig>) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const save = () => {
    const fd = new FormData();
    fd.set("intent", "save");
    fd.set("productId", productId);
    fd.set("productTitle", productTitle);
    fd.set("splitPct", splitPct);
    fd.set("markets", JSON.stringify(rows));
    fetcher.submit(fd, { method: "post" });
  };

  const run = (id: number, intent: "start" | "stop") => {
    const fd = new FormData();
    fd.set("intent", intent);
    fd.set("id", String(id));
    fetcher.submit(fd, { method: "post" });
  };

  return (
    <Page title="Prijstest">
      <Layout>
        {!discountConfigured && (
          <Layout.Section>
            <Banner tone="warning" title="Korting nog niet gekoppeld">
              <p>
                Maak in Shopify een automatische korting met de price-test Function
                en zet de id ervan in de omgevingsvariabele {DISCOUNT_NODE_ID_KEY}.
                Zonder die koppeling kan een test niet starten — de controlegroep
                zou dan de testprijs betalen zonder teruggave.
              </p>
            </Banner>
          </Layout.Section>
        )}

        {fetcher.data?.message && (
          <Layout.Section>
            <Banner tone={fetcher.data.ok ? "success" : "critical"}>
              <p>{fetcher.data.message}</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Nieuwe test</Text>
              <TextField label="Product-id" autoComplete="off" value={productId}
                onChange={setProductId} placeholder="gid://shopify/Product/10829796737366"
                helpText="Het product waarvan je de prijs wilt testen." />
              <TextField label="Naam (voor je eigen overzicht)" autoComplete="off"
                value={productTitle} onChange={setProductTitle} />
              <TextField label="Percentage bezoekers in de testgroep" type="number"
                autoComplete="off" value={splitPct} onChange={setSplitPct} suffix="%"
                helpText="De rest is de controlegroep en betaalt de huidige prijs." />

              <Divider />
              <InlineStack align="space-between">
                <Text as="h3" variant="headingSm">Markten</Text>
                <Button onClick={addMarket} disabled={!markets.length}>Markt toevoegen</Button>
              </InlineStack>

              {rows.map((r, i) => (
                <Box key={i} padding="300" borderWidth="025" borderColor="border" borderRadius="200">
                  <InlineStack gap="300" wrap>
                    <Select label="Markt" options={markets.map((m) => ({ label: `${m.name} (${m.currency})`, value: m.handle }))}
                      value={r.market}
                      onChange={(v) => {
                        const m = markets.find((x) => x.handle === v)!;
                        setRow(i, { market: v, currency: m.currency, price_list_id: m.priceListId });
                      }} />
                    <TextField label="Huidige prijs" type="number" autoComplete="off"
                      prefix={r.currency} value={String(r.baseline_amount)}
                      onChange={(v) => setRow(i, { baseline_amount: parseFloat(v) || 0 })} />
                    <TextField label="Testprijs" type="number" autoComplete="off"
                      prefix={r.currency} value={String(r.test_amount)}
                      onChange={(v) => setRow(i, { test_amount: parseFloat(v) || 0 })} />
                    <Box paddingBlockStart="600">
                      <Text as="span" tone="subdued">
                        Controlegroep krijgt {(r.test_amount - r.baseline_amount).toFixed(2)} {r.currency} terug
                      </Text>
                    </Box>
                    <Box paddingBlockStart="500">
                      <Button tone="critical" variant="plain"
                        onClick={() => setRows(rows.filter((_, idx) => idx !== i))}>Verwijderen</Button>
                    </Box>
                  </InlineStack>
                </Box>
              ))}

              <InlineStack align="end">
                <Button variant="primary" onClick={save}
                  disabled={!productId || !rows.length || fetcher.state !== "idle"}>Opslaan</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">Tests</Text>
              {!tests.length && <Text as="p" tone="subdued">Nog geen tests aangemaakt.</Text>}
              {tests.map((t: PriceTest) => (
                <Box key={t.id} padding="300" borderWidth="025" borderColor="border" borderRadius="200">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="span" variant="headingSm">{t.product_title || t.product_id}</Text>
                        <Badge tone={t.status === "running" ? "success" : t.status === "stopped" ? "critical" : "info"}>
                          {t.status}
                        </Badge>
                      </InlineStack>
                      <Text as="span" tone="subdued">
                        {t.split_pct}% test · {(t.markets || []).map((m) => `${m.market} ${m.baseline_amount}→${m.test_amount} ${m.currency}`).join(" · ")}
                      </Text>
                    </BlockStack>
                    {t.status === "running"
                      ? <Button tone="critical" onClick={() => run(t.id, "stop")} disabled={fetcher.state !== "idle"}>Stoppen</Button>
                      : <Button variant="primary" onClick={() => run(t.id, "start")} disabled={fetcher.state !== "idle" || !discountConfigured}>Starten</Button>}
                  </InlineStack>
                </Box>
              ))}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
