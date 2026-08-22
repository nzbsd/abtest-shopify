import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs, type LinksFunction } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useSearchParams, useNavigation } from "@remix-run/react";
import styles from "~/styles/dashboard.css?url";
import { Banner } from "~/components/ui";
import { isIngelogd, maakSessie, wachtwoordKlopt } from "~/lib/dashboardAuth.server";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: styles }];
export const meta = () => [{ title: "Inloggen · Price Test" }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (await isIngelogd(request)) throw redirect("/dashboard");
  // Of het wachtwoord is ingesteld verklappen we wel, het wachtwoord zelf niet.
  // Zonder dat signaal is een verkeerd ingerichte deploy niet te onderscheiden
  // van een typefout.
  return json({ ingesteld: Boolean(process.env.DASHBOARD_PASSWORD) });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const form = await request.formData();
  const wachtwoord = String(form.get("wachtwoord") || "");
  const next = String(form.get("next") || "/dashboard");

  if (!wachtwoordKlopt(wachtwoord)) {
    return json({ fout: "Onjuist wachtwoord." }, { status: 401 });
  }
  // Alleen paden binnen deze app, zodat een geknutselde next-parameter je na
  // het inloggen niet naar een vreemde site kan sturen.
  const veilig = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  return maakSessie(veilig);
};

export default function Login() {
  const data = useActionData<typeof action>();
  const { ingesteld } = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const nav = useNavigation();
  const bezig = nav.state !== "idle";

  return (
    <main className="login">
      <div className="card login__card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <span className="rail__mark"><span /></span>
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-.03em" }}>Price Test</span>
        </div>

        {!ingesteld && (
          <div style={{ marginBottom: 16 }}>
            <Banner tone="warn">
              <strong>Nog geen wachtwoord ingesteld.</strong> Zet <code>DASHBOARD_PASSWORD</code> in
              de omgeving; tot die tijd komt niemand binnen.
            </Banner>
          </div>
        )}

        {data?.fout && (
          <div style={{ marginBottom: 16 }}>
            <Banner tone="error">{data.fout}</Banner>
          </div>
        )}

        <Form method="post">
          <input type="hidden" name="next" value={params.get("next") || "/dashboard"} />
          <div className="field" style={{ marginBottom: 16 }}>
            <span className="field__label">Wachtwoord</span>
            <input name="wachtwoord" type="password" autoFocus autoComplete="current-password" />
          </div>
          <button className="btn btn--iris" type="submit" disabled={bezig}
                  style={{ width: "100%", justifyContent: "center" }}>
            {bezig ? "Bezig…" : "Inloggen"}
          </button>
        </Form>

        <p className="small muted" style={{ marginTop: 18 }}>
          Open je de app vanuit Shopify, dan hoef je hier niets in te vullen.
        </p>
      </div>
    </main>
  );
}
