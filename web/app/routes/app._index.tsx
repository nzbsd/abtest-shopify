import { redirect } from "@remix-run/node";

/* /app zelf heeft geen eigen scherm; stuur door naar de instelpagina. */
export const loader = async () => redirect("/app/price-test");
