import { redirect, type LoaderFunctionArgs } from "@remix-run/node";

/**
 * Bezoekers is de voordeur geworden, maar dit adres blijft werken.
 *
 * Er staan links in bladwijzers en in het admin-menu van eerdere installaties,
 * en een 404 op een pagina die je gisteren nog gebruikte is nergens goed voor.
 * De zoekopdracht gaat mee, zodat een gedeelde gefilterde weergave heel blijft.
 */
export const loader = ({ request }: LoaderFunctionArgs) =>
  redirect("/app" + new URL(request.url).search);
