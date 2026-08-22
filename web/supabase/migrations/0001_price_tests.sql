-- Prijs-A/B-tests per product en per markt.
--
-- WERKING (belangrijk om te snappen voor je hieraan sleutelt):
-- Shopify laat de prijs niet per bezoeker verhogen — kortingen gaan alleen
-- omlaag. Daarom draaien we het om: in de price list van de betreffende markt
-- zetten we een VASTE prijs gelijk aan de testprijs, en de controlegroep krijgt
-- via een Discount Function het verschil terug. De testgroep betaalt dus de
-- nieuwe prijs.
--
-- Per markt en niet via de basisprijs: elke markt heeft hier een eigen price
-- list met adjustment 0%. Een vaste prijs zetten raakt alleen die ene markt, en
-- stoppen is het VERWIJDEREN van die vaste prijs — de markt valt dan
-- automatisch terug op de afgeleide prijs. De basisprijs blijft onaangeroerd.
--
-- baseline_amount bewaren we alsnog: het is wat de klant zonder test betaald
-- zou hebben, en daarmee de referentie voor de controlegroep-korting en voor
-- de omzetvergelijking in de analytics.

-- RAAKT DIT DE BUNDELS? Nee, en dat is op twee manieren geborgd:
--  1. De bestaande bundelkorting staat op combinesWith.productDiscounts = true
--     (gecontroleerd op de live shop), dus een tweede automatische
--     productkorting mag ernaast bestaan in plaats van hem te verdringen.
--  2. De prijstest-Function korting ALLEEN de gewone betaalde regel. Regels met
--     _bundle_free of _bundle_gift slaat hij over. De twee functions raken
--     daardoor nooit dezelfde cartregel, ook niet als Shopify de
--     combinatieregels ooit verandert.
-- Het gratis stuk uit de bundel blijft dus gratis, ongeacht de testprijs.

create table if not exists public.price_tests (
  id           bigint generated always as identity primary key,
  shop         text        not null,
  product_id   text        not null,            -- Shopify product GID
  product_title text,                           -- kopie voor de admin-lijst
  -- draft   : nog niets gebeurt, basisprijs ongemoeid
  -- running : basisprijs verhoogd, controlegroep krijgt het verschil terug
  -- stopped : korting uit; basisprijs hoort terug naar baseline_amount
  status       text        not null default 'draft'
               check (status in ('draft', 'running', 'stopped')),
  split_pct    int         not null default 50  -- % bezoekers in de TESTgroep
               check (split_pct between 1 and 99),

  -- Per markt: valuta, de opgehoogde prijs die live staat, en het bedrag dat
  -- de controlegroep terugkrijgt. Vorm:
  --   [{ "market": "united-states",
  --      "price_list_id": "gid://shopify/PriceList/32085377366",
  --      "currency": "USD", "baseline_amount": 35.93,
  --      "test_amount": 37.93, "control_discount": 2.00 }]
  -- control_discount = test_amount - baseline_amount, expliciet opgeslagen
  -- zodat de Function niet hoeft te rekenen.
  markets      jsonb       not null default '[]'::jsonb,

  started_at   timestamptz,
  stopped_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Eén lopende test per product: twee tegelijk zou de prijs dubbel verhogen.
create unique index if not exists price_tests_one_running_per_product
  on public.price_tests (shop, product_id)
  where status = 'running';

create index if not exists price_tests_shop_idx on public.price_tests (shop, status);

alter table public.price_tests enable row level security;
-- Geen policies: alleen de service-role key (server-side), zoals bundle_settings.

drop trigger if exists price_tests_set_updated_at on public.price_tests;
create trigger price_tests_set_updated_at
  before update on public.price_tests
  for each row execute function public.set_updated_at();


-- Eén rij per gebeurtenis per bezoeker. Zelfde opzet als bundle_events: de
-- storefront praat NOOIT rechtstreeks met Supabase, alles loopt via de app.
create table if not exists public.price_test_events (
  id          bigint generated always as identity primary key,
  shop        text        not null,
  test_id     bigint      not null references public.price_tests (id) on delete cascade,
  cohort      text        not null check (cohort in ('control', 'test')),
  event_type  text        not null check (event_type in ('view', 'atc', 'purchase')),
  product_id  text        not null,
  market      text,                              -- market handle, bv 'united-states'
  currency    text,
  visitor_id  text,                              -- cookie-id: houdt een bezoeker in dezelfde groep
  cart_token  text,
  order_id    text,                              -- gevuld door de orders/create-webhook
  revenue_cents bigint    not null default 0,    -- alleen bij 'purchase'
  created_at  timestamptz not null default now()
);

create index if not exists price_test_events_test_idx    on public.price_test_events (test_id, cohort, event_type);
create index if not exists price_test_events_created_idx on public.price_test_events (created_at);
-- Voorkomt dubbeltelling als de webhook twee keer binnenkomt (Shopify hergebruikt).
create unique index if not exists price_test_events_order_uniq
  on public.price_test_events (shop, order_id)
  where order_id is not null;

alter table public.price_test_events enable row level security;

-- Geaggregeerd per test en groep. security_invoker zodat de anon-key hier
-- net zomin bij kan als bij de onderliggende tabel.
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
-- Shopify geeft een offline sessie het id 'offline_<shop>' — dat id is voor
-- elke app hetzelfde. Zouden beide apps in shopify_sessions schrijven, dan
-- overschrijft de installatie van deze app het access token van de popup-app
-- voor diezelfde winkel. De popup-app draait dan verder met een token dat is
-- uitgegeven voor de verkeerde scopes, en haar achtergrondtaken vallen stil.
-- Daarom een aparte tabel; de twee apps delen de database maar niet de sessies.
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
-- Geen policies: alleen de service-role key komt erbij.
