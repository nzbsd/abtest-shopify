import { redirect, type LoaderFunctionArgs } from "@remix-run/node";

/** Zie app.visitors: het adres blijft werken, de inhoud staat op de index. */
export const loader = ({ request }: LoaderFunctionArgs) =>
  redirect("/dashboard" + new URL(request.url).search);
