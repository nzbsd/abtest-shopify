import { redirect } from "@remix-run/node";

/* De publieke voorkant is het dashboard; dat zit zelf achter een wachtwoord. */
export const loader = async () => redirect("/dashboard");
