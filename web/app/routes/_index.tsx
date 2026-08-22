import { redirect, type LoaderFunctionArgs } from "@remix-run/node";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw redirect(`/app/price-test?${url.searchParams.toString()}`);
  }
  return null;
};

export default function Index() {
  return (
    <main style={{ fontFamily: "system-ui", padding: 32, maxWidth: 600 }}>
      <h1>Herbies Price Test</h1>
      <p>Prijs-A/B-tests per product en per markt. Interne app.</p>
    </main>
  );
}
