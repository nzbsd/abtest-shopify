-- Een heel thema tegen een ander thema.
--
-- Werkt via ?preview_theme_id=<id>: Shopify serveert dan het onuitgegeven
-- thema, haalt de parameter uit de URL en houdt het vol voor de rest van de
-- sessie. Nagemeten op de winkel, ook op een productpagina.
--
-- Er hoort geen product bij, dus control_product_id kan hier niets zinnigs
-- bevatten. Die kolom is daarom niet langer verplicht.

alter table price_tests
  add column if not exists test_theme_id   text,
  add column if not exists test_theme_name text;

alter table price_tests
  alter column control_product_id drop not null;

alter table price_tests drop constraint if exists price_tests_test_type_check;
alter table price_tests add constraint price_tests_test_type_check
  check (test_type in ('price', 'template', 'url', 'theme'));

alter table price_tests drop constraint if exists price_tests_type_compleet;
alter table price_tests add constraint price_tests_type_compleet check (
  case test_type
    when 'price'    then control_product_id is not null
                         and test_product_id is not null and test_product_handle is not null
    when 'template' then control_product_id is not null and template_suffix is not null
    when 'url'      then control_url is not null and test_url is not null
                         and control_url <> test_url
    when 'theme'    then test_theme_id is not null
    else false
  end
);

-- Eén lopende test per doel per type. Bij een thema-test is er geen product,
-- dus valt het doel weg; de index staat dan één lopende thema-test per winkel
-- toe, en dat is precies goed: twee thema-tests tegelijk zouden elkaars
-- bezoekers heen en weer sturen.
drop index if exists price_tests_one_running_per_target;
create unique index price_tests_one_running_per_target
  on price_tests (shop, coalesce(control_product_id, ''), test_type)
  where status = 'running';
