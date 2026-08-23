-- Meer dan één soort test.
--
-- De tabel ging ervan uit dat elke test twee producten heeft. Dat is alleen bij
-- een prijstest zo: een template-test draait op één product, en een url-test op
-- geen enkel product. Vandaar dat de productkolommen leeg mogen blijven, en dat
-- een check bewaakt dat elk type wél heeft wat het nodig heeft.

alter table price_tests
  add column if not exists test_type       text not null default 'price',
  add column if not exists template_suffix text,
  add column if not exists control_url     text,
  add column if not exists test_url        text,
  add column if not exists naam            text,
  add column if not exists hypothese       text;

do $$ begin
  alter table price_tests add constraint price_tests_test_type_check
    check (test_type in ('price', 'template', 'url'));
exception when duplicate_object then null; end $$;

-- Alleen een prijstest heeft een tweede product.
alter table price_tests
  alter column test_product_id     drop not null,
  alter column test_product_handle drop not null;

-- Wat per type ingevuld moet zijn. Zonder deze check zou een half opgezette
-- test gewoon opgeslagen worden en daarna stilzwijgend niets doen: het thema
-- slaat een test zonder bestemming over, en dan sta je naar een lopende test te
-- kijken die geen enkele bezoeker ooit ziet.
do $$ begin
  alter table price_tests add constraint price_tests_type_compleet check (
    case test_type
      when 'price'    then test_product_id is not null and test_product_handle is not null
      when 'template' then template_suffix is not null
      when 'url'      then control_url is not null and test_url is not null
                           and control_url <> test_url
      else false
    end
  );
exception when duplicate_object then null; end $$;

-- Eén lopende test per doel per type. Twee prijstests op hetzelfde product
-- zouden elkaars bezoekers wegkapen; een prijstest en een template-test naast
-- elkaar mogen wel, die meten iets anders.
--
-- Bij een url-test staat het pad in control_product_id. Niet fraai, maar het
-- houdt deze index en de toewijzing in orders.server.ts op één kolom werken.
drop index if exists price_tests_one_running;
create unique index if not exists price_tests_one_running_per_target
  on price_tests (shop, control_product_id, test_type)
  where status = 'running';
