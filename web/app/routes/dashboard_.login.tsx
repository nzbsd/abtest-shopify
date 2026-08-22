import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs, type LinksFunction } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useSearchParams, useNavigation } from "@remix-run/react";
import styles from "~/styles/dashboard.css?url";
import { isIngelogd, maakSessie, wachtwoordKlopt } from "~/lib/dashboardAuth.server";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: styles }];

export const meta = () => [{ title: "Inloggen · Price Test" }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (await isIngelogd(request)) throw redirect("/dashboard");
  // Of het wachtwoord is ingesteld verklappen we wel; het wachtwoord zelf niet.
  // Zonder dat signaal is een verkeerd geconfigureerde deploy niet van een
  // typefout te onderscheiden.
  return json({ ingesteld: Boolean(process.env.DASHBOARD_PASSWORD) });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const form = await request.formData();
  const wachtwoord = String(form.get("wachtwoord") || "");
  const next = String(form.get("next") || "/dashboard");

  if (!wachtwoordKlopt(wachtwoord)) {
    return json({ fout: "Onjuist wachtwoord." }, { status: 401 });
  }
  // Alleen paden binnen deze app, zodat een geknutselde next-parameter je niet
  // na het inloggen naar een vreemde site kan sturen.
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
    <main className="login-wrap">
      <div className="card login-card">
        <div className="card__head">
          <h2>Price Test</h2>
        </div>
        <div className="card__body">
          {!ingesteld && (
            <div className="banner banner--warn">
              <strong>Nog geen wachtwoord ingesteld.</strong> Zet <code>DASHBOARD_PASSWORD</code> in
              de omgeving; tot die tijd komt niemand binnen.
            </div>
          )}
          {data?.fout && <div className="banner banner--error">{data.fout}</div>}
          <Form method="post">
            <input type="hidden" name="next" value={params.get("next") || "/dashboard"} />
            <div className="field">
              <label htmlFor="wachtwoord">Wachtwoord</label>
              <input id="wachtwoord" name="wachtwoord" type="password" autoFocus autoComplete="current-password" />
            </div>
            <button className="btn btn--primary" type="submit" disabled={bezig} style={{ width: "100%", justifyContent: "center" }}>
              {bezig ? "Bezig…" : "Inloggen"}
            </button>
          </Form>
        </div>
      </div>
    </main>
  );
}
