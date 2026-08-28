-- Kassatest: van één banner naar vijf mechanieken.
--
-- WAAROM DE VIJF TEKSTKOLOMMEN WEER WEG GAAN
-- Ze pasten bij precies één vorm van deze test: een banner met een kop en een
-- tekst. Een vertrouwensrij heeft een lijst met regels, een verzendbalk heeft
-- een drempel en twee teksten, een upsell heeft een variant-id, en een
-- verzendtest heeft helemaal geen tekst maar een lijst met operaties. Dat in
-- kolommen persen betekent vijfentwintig kolommen waarvan er per test hooguit
-- vier gevuld zijn, en elke nieuwe mechaniek is dan weer een migratie.
--
-- Dus: één kolom die zegt wélke mechaniek het is, en één die zegt hoe hij is
-- ingesteld. Er staat nog geen enkele kassatest in de tabel, dus er valt niets
-- te verhuizen - dit is opruimen voordat er iets op ligt.
--
-- WAAROM JSONB EN NIET EEN TABEL ERNAAST
-- De inhoud wordt door precies twee dingen gelezen - het configuratie-eindpunt
-- en, bij een verzendtest, een metafield op de delivery customization - en door
-- niets bevraagd. Er is geen enkele vraag van de vorm "welke tests noemen deze
-- verzendoptie". Een tabel zou dan alleen maar een join opleveren.
alter table public.price_tests
  drop column if exists checkout_kop,
  drop column if exists checkout_tekst,
  drop column if exists checkout_toon,
  drop column if exists checkout_control_kop,
  drop column if exists checkout_control_tekst;

alter table public.price_tests
  drop constraint if exists price_tests_checkout_toon_check;

alter table public.price_tests
  add column if not exists checkout_variant text,
  add column if not exists checkout_config  jsonb;

-- Vijf mechanieken, en niet meer. Een zesde waarde zou het configuratie-eindpunt
-- stil overslaan en de kassa-extensie niets laten tekenen: een test die loopt,
-- meet, en per definitie nul verschil rapporteert.
alter table public.price_tests
  drop constraint if exists price_tests_checkout_variant_check;

alter table public.price_tests
  add constraint price_tests_checkout_variant_check
  check (checkout_variant is null or checkout_variant in
         ('banner', 'trust', 'faq', 'shipbar', 'upsell', 'verzending'));

-- Waar de delivery customization van een verzendtest zit.
--
-- Zonder dit zou elke start een nieuwe aanmaken. Een winkel mag er
-- vijfentwintig hebben, en een stapel wezen van gestopte tests eet die grens
-- langzaam op zonder dat iemand kan zien waar ze vandaan komen.
alter table public.price_tests
  add column if not exists checkout_customization_id text;
