import { redirect, type ActionFunctionArgs } from "@remix-run/node";
import { verbreekSessie } from "~/lib/dashboardAuth.server";

export const action = async ({ request }: ActionFunctionArgs) => verbreekSessie(request);

// Uitloggen alleen via POST: een GET zou betekenen dat een <img> of link van
// buitenaf je sessie kan beëindigen.
export const loader = async () => redirect("/dashboard");
