-- Prijs-A/B-tests: duplicaat-product tegenover het origineel.
--
-- WERKING
-- Shopify kent een prijs per variant en kan die niet per bezoeker verhogen.
-- Daarom draait deze test op TWEE producten: het origineel (controlegroep) en
-- een duplicaat met een hogere prijs (testgroep). Beide zijn echte producten
-- met echte Shopify-prijzen.
--
-- De bezoeker blijft op de URL van het origineel. Het thema bepaalt zijn groep
-- en vervangt voor de testgroep de getoonde prijs en de variant die in de cart
-- belandt door die van het duplicaat.
--
-- WAT DEZE APP NIET DOET: prijzen wijzigen. De prijs van het duplicaat zet je
-- zelf in Shopify, per markt zoals je wilt. Het thema leest die live uit
-- /products/<handle>.js en krijgt daarmee automatisch de juiste valuta. Er is
-- dus geen prijs die hier wordt opgeslagen en die kan gaan afwijken van wat de
-- klant betaalt.
--
-- WAT JE ZELF MOET KOPPELEN AAN HET DUPLICAAT
--   * de bundelconfig (die keyt op product-id, dus het duplicaat staat er niet
--     automatisch in)
--   * het selling plan, anders kan de testgroep geen abonnement afsluiten
--   * reviews, als je die per product toont
-- Vergeet je er een, dan meet je dat verschil in plaats van de prijs.

create table if not exists public.price_tests (
  id           bigint generated always as identity primary key,
  shop         text not null,

  -- Het origineel: de URL waar bezoekers binnenkomen, en de controlegroep.
  control_product_id text not null,          -- gid://shopify/Product/...
  control_title      text,

  -- Het duplicaat met de hogere prijs: de testgroep.
  test_product_id     text not null,
  test_product_handle text not null,         -- voor /products/<handle>.js
  test_title          text,

  -- Variant-voor-variant koppeling. Een product met 1/3/6 flessen heeft in het
  -- duplicaat dezelfde opties; deze map zegt welke variant waar hoort. Vorm:
  --   [{ "control_num": 123, "test_num": 456, "title": "3 Bottles" }]
  -- Numeriek en niet als gid: het thema werkt met numerieke variant-ids.
  variant_map  jsonb not null default '[]'::jsonb,

  status       text not null default 'draft'
               check (status in ('draft', 'running', 'stopped')),
  split_pct    int  not null default 50      -- % bezoekers in de TESTgroep
               check (split_pct between 1 and 99),

  started_at   timestamptz,
  stopped_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Eén lopende test per product: twee tegelijk zouden elkaars variant-swap
-- overschrijven en de bezoeker een willekeurige prijs geven.
create unique index if not exists price_tests_one_running_per_product
  on public.price_tests (shop, control_product_id)
  where status = 'running';

create index if not exists price_tests_shop_idx on public.price_tests (shop, status);

alter table public.price_tests enable row level security;
-- Geen policies: alleen de service-role key (server-side), zoals bundle_settings.

drop trigger if exists price_tests_set_updated_at on public.price_tests;
create trigger price_tests_set_updated_at
  before update on public.price_tests
  for each row execute function public.set_updated_at();


-- Eén rij per gebeurtenis. De storefront praat NOOIT rechtstreeks met
-- Supabase; alles loopt via de app.
create table if not exists public.price_test_events (
  id          bigint generated always as identity primary key,
  shop        text not null,
  test_id     bigint not null references public.price_tests (id) on delete cascade,
  cohort      text not null check (cohort in ('control', 'test')),
  event_type  text not null check (event_type in ('view', 'atc', 'purchase')),
  product_id  text not null,                 -- welk van de twee producten
  market      text,
  currency    text,
  visitor_id  text,
  cart_token  text,
  order_id    text,
  revenue_cents bigint not null default 0,   -- alleen bij 'purchase'
  created_at  timestamptz not null default now()
);

create index if not exists price_test_events_test_idx    on public.price_test_events (test_id, cohort, event_type);
create index if not exists price_test_events_created_idx on public.price_test_events (created_at);
-- Voorkomt dubbeltelling als Shopify de webhook twee keer stuurt.
create unique index if not exists price_test_events_order_uniq
  on public.price_test_events (shop, order_id)
  where order_id is not null;

alter table public.price_test_events enable row level security;

create or replace view public.price_test_stats with (security_invoker = true) as
select
  e.shop,
  e.test_id,
  e.cohort,
  e.market,
  count(*) filter (where e.event_type = 'view')     as views,
  count(*) filter (where e.event_type = 'atc')      as add_to_carts,
  count(*) filter (where e.event_type = 'purchase') as orders,
  coalesce(sum(e.revenue_cents) filter (where e.event_type = 'purchase'), 0) as revenue_cents,
  count(distinct e.visitor_id) filter (where e.event_type = 'view')          as visitors,
  max(e.created_at)                                 as last_event_at
from public.price_test_events e
group by e.shop, e.test_id, e.cohort, e.market;


-- ---------------------------------------------------------------------------
-- Sessies van DEZE app, bewust in een EIGEN tabel.
--
-- Shopify geeft een offline sessie het id 'offline_<shop>' - dat id is voor
-- elke app hetzelfde. Zouden beide apps in shopify_sessions schrijven, dan
-- overschrijft de installatie van deze app het access token van de popup-app
-- voor diezelfde winkel. De popup-app draait dan verder met een token dat is
-- uitgegeven voor de verkeerde scopes, en haar achtergrondtaken vallen stil.
-- ---------------------------------------------------------------------------
create table if not exists public.price_test_sessions (
  id      text primary key,
  shop    text not null,
  data    jsonb not null,
  expires timestamptz
);

create index if not exists price_test_sessions_shop_idx
  on public.price_test_sessions (shop);

alter table public.price_test_sessions enable row level security;


-- Per dag, voor de grafieken op het dashboard. Aggregeren in Postgres en niet
-- in de app: bij een test van enkele weken zijn dat tienduizenden rijen die we
-- anders allemaal over de lijn zouden trekken om ze daarna weg te gooien.
create or replace view public.price_test_daily with (security_invoker = true) as
select
  e.shop,
  e.test_id,
  e.cohort,
  (e.created_at at time zone 'UTC')::date as dag,
  count(*) filter (where e.event_type = 'view')     as views,
  count(*) filter (where e.event_type = 'atc')      as add_to_carts,
  count(*) filter (where e.event_type = 'purchase') as orders,
  coalesce(sum(e.revenue_cents) filter (where e.event_type = 'purchase'), 0) as revenue_cents,
  count(distinct e.visitor_id) filter (where e.event_type = 'view')          as visitors
from public.price_test_events e
group by e.shop, e.test_id, e.cohort, (e.created_at at time zone 'UTC')::date;
