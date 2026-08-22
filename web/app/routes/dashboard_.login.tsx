import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs, type LinksFunction } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useSearchParams, useNavigation } from "@remix-run/react";
import styles from "~/styles/dashboard.css?url";
import { Banner } from "~/components/ui";
import { isIngelogd, maakSessie, wachtwoordKlopt } from "~/lib/dashboardAuth.server";
import { ipVan, magNog, tellingVan, wisSleutel } from "~/lib/rateLimit.server";

export const links: LinksFunction = () => [{ rel: "stylesheet", href: styles }];
export const meta = () => [{ title: "Sign in · Price Test" }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (await isIngelogd(request)) throw redirect("/dashboard");
  // Of het wachtwoord is ingesteld verklappen we wel, het wachtwoord zelf niet.
  // Zonder dat signaal is een verkeerd ingerichte deploy niet te onderscheiden
  // van een typefout.
  return json({ ingesteld: Boolean(process.env.DASHBOARD_PASSWORD) });
};

/* One password on a public URL is only as good as the number of guesses
   allowed. Ten failures per quarter hour is far more than anyone typing by
   hand needs, and it turns a short password from guessable into impractical. */
const MAX_POGINGEN = 10;
const VENSTER_MS = 15 * 60 * 1000;

export const action = async ({ request }: ActionFunctionArgs) => {
  const form = await request.formData();
  const wachtwoord = String(form.get("wachtwoord") || "");
  const next = String(form.get("next") || "/dashboard");

  const sleutel = "login:" + ipVan(request);

  if (tellingVan(sleutel, VENSTER_MS) >= MAX_POGINGEN) {
    return json(
      { fout: "Too many attempts. Try again in fifteen minutes." },
      { status: 429 },
    );
  }

  if (!wachtwoordKlopt(wachtwoord)) {
    magNog(sleutel, MAX_POGINGEN, VENSTER_MS);   // count this failure

    // A deliberate pause on every wrong answer. It costs a person nothing and
    // caps an automated guesser at a couple of tries a second even before the
    // lockout kicks in.
    await new Promise((r) => setTimeout(r, 700));

    return json({ fout: "Incorrect password." }, { status: 401 });
  }

  // A correct password clears the counter, so a forgetful evening does not
  // lock you out for the rest of the quarter hour.
  wisSleutel(sleutel);
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
              <strong>No password set yet.</strong> Set <code>DASHBOARD_PASSWORD</code> in the
              environment; until then nobody gets in.
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
            <span className="field__label">Password</span>
            <input name="wachtwoord" type="password" autoFocus autoComplete="current-password" />
          </div>
          <button className="btn btn--iris" type="submit" disabled={bezig}
                  style={{ width: "100%", justifyContent: "center" }}>
            {bezig ? "Working…" : "Sign in"}
          </button>
        </Form>

        <p className="small muted" style={{ marginTop: 18 }}>
          Opening the app from Shopify signs you in automatically — no password needed there.
        </p>
      </div>
    </main>
  );
}
