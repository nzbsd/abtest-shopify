import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page, Layout, Card, BlockStack, Text, DataTable, Badge, Banner, InlineStack,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import supabase from "~/db.server";
import { loadTests, type PriceTest } from "~/lib/priceTest.server";

type Rij = {
  test_id: number; cohort: string; market: string | null;
  views: number; add_to_carts: number; orders: number;
  revenue_cents: number; visitors: number;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const [tests, stats] = await Promise.all([
    loadTests(session.shop),
    supabase.from("price_test_stats").select("*").eq("shop", session.shop),
  ]);
  return json({ tests, rows: (stats.data || []) as Rij[] });
};

/**
 * Omzet per bezoeker is de maat die telt.
 *
 * Conversieratio alleen misleidt bij een prijstest: een hogere prijs verlaagt
 * de conversie bijna altijd, terwijl de omzet kan stijgen. Andersom kan een
 * lagere prijs beter converteren en toch minder opleveren. Daarom staat
 * omzet per bezoeker vooraan en is conversie ondersteunend.
 */
function perBezoeker(cents: number, visitors: number) {
  if (!visitors) return 0;
  return cents / 100 / visitors;
}

export default function ResultsPage() {
  const { tests, rows } = useLoaderData<typeof loader>();

  return (
    <Page title="Prijstest — resultaten">
      <Layout>
        <Layout.Section>
          <Banner tone="info" title="Hoe je dit leest">
            <p>
              Omzet per bezoeker is de uitslag; conversie is context. Een hogere
              prijs drukt de conversie vrijwel altijd — de vraag is of de hogere
              marge dat compenseert. Wacht met concluderen tot beide groepen
              enkele honderden bezoekers hebben, anders meet je toeval.
            </p>
          </Banner>
        </Layout.Section>

        {tests.map((t: PriceTest) => {
          const eigen = rows.filter((r) => r.test_id === t.id);
          const groepen = ["control", "test"].map((c) => {
            const g = eigen.filter((r) => r.cohort === c);
            const som = (k: keyof Rij) => g.reduce((a, r) => a + (Number(r[k]) || 0), 0);
            const visitors = som("visitors");
            const revenue = som("revenue_cents");
            return {
              cohort: c, visitors, orders: som("orders"),
              atc: som("add_to_carts"), revenue,
              rpv: perBezoeker(revenue, visitors),
              cr: visitors ? (som("orders") / visitors) * 100 : 0,
            };
          });

          const c = groepen[0], v = groepen[1];
          const verschil = c.rpv > 0 ? ((v.rpv - c.rpv) / c.rpv) * 100 : 0;

          return (
            <Layout.Section key={t.id}>
              <Card>
                <BlockStack gap="400">
                  <InlineStack gap="200" blockAlign="center">
                    <Text as="h2" variant="headingMd">{t.product_title || t.product_id}</Text>
                    <Badge tone={t.status === "running" ? "success" : "info"}>{t.status}</Badge>
                  </InlineStack>

                  <DataTable
                    columnContentTypes={["text", "numeric", "numeric", "numeric", "numeric", "numeric"]}
                    headings={["Groep", "Bezoekers", "Add to cart", "Orders", "Conversie", "Omzet / bezoeker"]}
                    rows={groepen.map((g) => [
                      g.cohort === "control" ? "Controle (huidige prijs)" : "Test (nieuwe prijs)",
                      g.visitors, g.atc, g.orders,
                      g.cr.toFixed(2) + "%",
                      g.rpv.toFixed(2),
                    ])}
                  />

                  {c.visitors > 0 && v.visitors > 0 && (
                    <Text as="p" tone={verschil >= 0 ? "success" : "critical"}>
                      De testprijs levert {verschil >= 0 ? "" : ""}{verschil.toFixed(1)}% {verschil >= 0 ? "meer" : "minder"} omzet per bezoeker op.
                      {(c.visitors < 300 || v.visitors < 300) &&
                        " Nog te weinig bezoekers om hier iets aan vast te knopen."}
                    </Text>
                  )}

                  {eigen.length > 0 && (
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingSm">Per markt</Text>
                      <DataTable
                        columnContentTypes={["text", "text", "numeric", "numeric", "numeric"]}
                        headings={["Markt", "Groep", "Bezoekers", "Orders", "Omzet"]}
                        rows={eigen.map((r) => [
                          r.market || "—", r.cohort, r.visitors, r.orders,
                          (r.revenue_cents / 100).toFixed(2),
                        ])}
                      />
                    </BlockStack>
                  )}
                </BlockStack>
              </Card>
            </Layout.Section>
          );
        })}

        {!tests.length && (
          <Layout.Section>
            <Card><Text as="p" tone="subdued">Nog geen tests.</Text></Card>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
