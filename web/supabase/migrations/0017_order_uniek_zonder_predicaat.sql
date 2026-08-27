-- De unieke index op (shop, order_id) was partieel: WHERE order_id IS NOT NULL.
--
-- Postgres kan een partiele index alleen gebruiken bij ON CONFLICT als de
-- opdracht datzelfde predicaat meegeeft. De Supabase-client stuurt bij
-- onConflict: "shop,order_id" alleen de kolommen mee, geen WHERE, en dus vond
-- Postgres geen bruikbare index:
--
--   42P10: there is no unique or exclusion constraint matching the
--          ON CONFLICT specification
--
-- Elke purchase-upsert in de orderwebhook gooide die fout, en de catch eromheen
-- slikte hem stil op. Daardoor liep test 2 vier dagen met 29.456 views en 1.941
-- add-to-carts zonder ook maar een enkele order vast te leggen.
--
-- Zonder predicaat vindt ON CONFLICT (shop, order_id) hem wel. Rijen zonder
-- order_id - de view- en atc-gebeurtenissen, ruim 31.000 stuks - blijven
-- ongemoeid: NULL geldt in een unieke index standaard als onderscheidend, dus
-- daar mogen er zoveel van zijn als nodig.

create unique index if not exists price_test_events_order_uniq2
  on public.price_test_events (shop, order_id);

drop index if exists public.price_test_events_order_uniq;

alter index public.price_test_events_order_uniq2
  rename to price_test_events_order_uniq;
