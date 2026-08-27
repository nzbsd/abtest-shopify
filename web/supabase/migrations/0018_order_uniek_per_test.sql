-- De unieke sleutel stond op (shop, order_id) en miste test_id.
--
-- Een bezoeker kan in meer dan een test tegelijk zitten - een paginatest dekt
-- elke pagina en overlapt dus met elke producttest eronder - en de webhook
-- schrijft per test een regel. Met deze sleutel claimde de eerste test de
-- bestelling en kon geen enkele andere hem meer vastleggen.
--
-- Dat gebeurde ook echt. Nadat migratie 0017 de purchase-upsert had gerepareerd
-- ging test 2 - gestopt op 26 augustus - de dag erna negenendertig bestellingen
-- vastleggen, en test 13 kwam niet verder dan vijf. Idempotentie hoort per test
-- te gelden, niet per winkel.
--
-- De webhook filtert sinds dezelfde wijziging ook op de looptijd: een gestopte
-- test krijgt alleen nog bestellingen die geplaatst zijn toen hij nog liep.

create unique index if not exists price_test_events_order_uniq2
  on public.price_test_events (shop, test_id, order_id);

drop index if exists public.price_test_events_order_uniq;

alter index public.price_test_events_order_uniq2
  rename to price_test_events_order_uniq;
