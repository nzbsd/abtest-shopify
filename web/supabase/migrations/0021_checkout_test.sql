-- Kassatest: een blok in de kassa dat de ene groep wel ziet en de andere niet.
--
-- Waarom tekst in de database en niet in de instellingen van de extensie:
-- die instellingen staan per blok in de kassa-editor, en daar is maar één
-- exemplaar van. Twee varianten zouden dan twee blokken zijn, allebei zichtbaar
-- voor iedereen. Wat de twee groepen zien hoort bij de test, niet bij de
-- plaatsing - dus staat het hier, naast alles wat een test verder definieert.
--
-- De controlekant mag leeg zijn. Dat is de gewone vorm van deze test: verandert
-- het iets als er hier iets extra's staat? Vul je hem wel, dan zetten we twee
-- boodschappen tegenover elkaar en ziet niemand een lege kassa.
alter table public.price_tests
  add column if not exists checkout_kop           text,
  add column if not exists checkout_tekst         text,
  add column if not exists checkout_toon          text,
  add column if not exists checkout_control_kop   text,
  add column if not exists checkout_control_tekst text;

-- De toon bepaalt de kleur van het blok in de kassa. Vier waarden, want dat is
-- wat de kassa kent; een vijfde zou stil op de standaardkleur uitkomen en dan
-- staat er iets anders dan je hebt ingesteld.
alter table public.price_tests
  drop constraint if exists price_tests_checkout_toon_check;

alter table public.price_tests
  add constraint price_tests_checkout_toon_check
  check (checkout_toon is null or checkout_toon in ('info', 'success', 'warning', 'critical'));
