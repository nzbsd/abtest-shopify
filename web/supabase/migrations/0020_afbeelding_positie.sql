-- Afbeeldingstest: welke foto de testgroep vooraan ziet.
--
-- Eén kolom in plaats van een eigen tabel. De positie is precies zoveel
-- configuratie als template_suffix of test_theme_id, en die staan hier ook:
-- één test, één rij, één plek om te kijken wat er ingesteld staat.
--
-- Positie en niet een media-id. Het thema herordent de galerij zoals hij op
-- de pagina staat en heeft geen enkele manier om een Shopify-media-id terug
-- te vinden in de opgemaakte HTML. Een positie kan het wel: dat is het n-de
-- kind van de galerij, en dat is precies wat er verplaatst moet worden.
--
-- Ondergrens twee. Foto 1 staat al vooraan, dus die kiezen levert twee armen
-- op die exact dezelfde pagina zien: een test die per definitie niets meet,
-- maar wel dagen loopt voordat iemand dat doorheeft. Bovengrens twintig, want
-- zoveel foto's haalt de app op bij het product; een hogere positie zou naar
-- een foto wijzen die de wizard nooit getoond heeft.
alter table public.price_tests
  add column if not exists image_positie int;

alter table public.price_tests
  drop constraint if exists price_tests_image_positie_check;

alter table public.price_tests
  add constraint price_tests_image_positie_check
  check (image_positie is null or (image_positie >= 2 and image_positie <= 20));
