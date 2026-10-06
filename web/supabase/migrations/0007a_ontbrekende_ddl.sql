-- De DDL die alleen in Supabase stond.
--
-- WAAROM DIT BESTAND ER IS
-- 0007 zegt het zelf: de tabellen van de bezoekersanalytics zijn rechtstreeks in
-- Supabase aangemaakt (site_analytics, site_analytics_opnieuw, ...), en 0013 tot
-- en met 0015 ontbreken in deze map. Daarnaast gebruiken 0019 en de
-- orders/create-webhook kolommen (units, is_subscription, variant_title, ...) en
-- functies (site_order_toekennen) die geen enkele migratie hier aanmaakt.
-- Gevolg: uit deze map viel de database niet opnieuw op te bouwen.
--
-- Dit is uitgelezen uit de live database (project email-popup) op 6 oktober
-- 2026, met pg_get_functiondef / pg_get_viewdef / pg_catalog - niet uit het
-- hoofd nagetypt. Zo staat het er nu.
--
-- VOLGORDE
-- Tussen 0007 en 0008 omdat 0008 en later deze tabellen al aanpassen. Alles is
-- idempotent (if not exists, create or replace), dus op de bestaande database
-- verandert dit niets; op een lege maakt het wat er hoort te staan. Kolommen
-- die latere migraties toevoegen (laatste_order, deed_contact, ...) staan hier
-- al in de tabel; hun `add column if not exists` doet daarna niets.
--
-- De functies die latere migraties zelf opnieuw schrijven (site_order,
-- site_signaal, site_live, site_overzicht, price_test_ordercijfers) staan hier
-- niet: die staan al in de repo.

-- ── price_tests / price_test_events: kolommen zonder migratie ─────────────

alter table public.price_tests
  add column if not exists control_product_handle text,
  add column if not exists is_subscription        boolean not null default false,
  add column if not exists avg_cycles             numeric(6,2),
  add column if not exists avg_cycles_test        numeric(6,2);

alter table public.price_test_events
  add column if not exists is_subscription boolean,
  add column if not exists units           integer,
  add column if not exists variant_id      text,
  add column if not exists variant_title   text,
  add column if not exists line_count      integer;

create or replace view public.price_test_orders with (security_invoker = true) as
select shop, test_id, cohort,
       count(*) as orders,
       count(*) filter (where is_subscription) as sub_orders,
       count(*) filter (where is_subscription is not true) as eenmalig_orders,
       coalesce(sum(revenue_cents), 0::numeric) as revenue_cents,
       coalesce(sum(revenue_cents) filter (where is_subscription), 0::numeric) as sub_revenue_cents,
       coalesce(sum(units), 0::bigint) as units,
       coalesce(avg(nullif(units, 0)), 0::numeric) as units_per_order
from public.price_test_events e
where event_type = 'purchase'
group by shop, test_id, cohort;

create or replace view public.price_test_variants with (security_invoker = true) as
select shop, test_id, cohort,
       coalesce(variant_title, '(unknown)') as variant_title,
       count(*) as orders,
       coalesce(sum(units), 0::bigint) as units,
       coalesce(sum(revenue_cents), 0::numeric) as revenue_cents,
       count(*) filter (where is_subscription) as sub_orders
from public.price_test_events e
where event_type = 'purchase'
group by shop, test_id, cohort, coalesce(variant_title, '(unknown)');

-- ── bezoekersanalytics: sessies ───────────────────────────────────────────

create table if not exists public.site_sessies (
  session_id      text primary key,
  shop            text not null,
  visitor_id      text not null,
  begonnen        timestamptz not null default now(),
  laatst          timestamptz not null default now(),
  pageviews       integer not null default 0,
  paden           text[] not null default '{}'::text[],
  duur_ms         integer not null default 0,
  max_scroll      smallint not null default 0,
  instap          text,
  uitstap         text,
  verwijzer       text,
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  country         text,
  device          text,
  zag_collectie   boolean not null default false,
  zag_product     boolean not null default false,
  zag_cart        boolean not null default false,
  zag_checkout    boolean not null default false,
  nieuw           boolean not null default true,
  browser         text,
  os              text,
  taal            text,
  scherm          text,
  orders          integer not null default 0,
  omzet_cents     bigint not null default 0,
  deed_atc        boolean not null default false,
  ging_checkout   boolean not null default false,
  laatste_order   timestamptz,
  deed_contact    boolean not null default false,
  deed_verzending boolean not null default false,
  deed_betaling   boolean not null default false,
  atc_pixel       boolean not null default false,
  checkout_pixel  boolean not null default false
);
alter table public.site_sessies enable row level security;

create index if not exists site_sessies_shop_tijd on public.site_sessies (shop, begonnen desc);
create index if not exists site_sessies_bezoeker  on public.site_sessies (shop, visitor_id);
create index if not exists site_sessies_laatst    on public.site_sessies (shop, laatst desc);

-- ── bezoekersanalytics: dagtotalen (blijven na de 30 dagen staan) ─────────

create table if not exists public.site_dag (
  shop          text not null,
  dag           date not null,
  bezoekers     integer not null default 0,
  nieuwe        integer not null default 0,
  sessies       integer not null default 0,
  pageviews     integer not null default 0,
  bounces       integer not null default 0,
  duur_ms_som   bigint  not null default 0,
  zag_collectie integer not null default 0,
  zag_product   integer not null default 0,
  zag_cart      integer not null default 0,
  zag_checkout  integer not null default 0,
  orders        integer not null default 0,
  omzet_cents   bigint  not null default 0,
  deed_atc      integer not null default 0,
  ging_checkout integer not null default 0,
  primary key (shop, dag)
);

create table if not exists public.site_dag_pad (
  shop        text not null,
  dag         date not null,
  path        text not null,
  pageviews   integer not null default 0,
  instappen   integer not null default 0,
  uitstappen  integer not null default 0,
  duur_ms_som bigint  not null default 0,
  scroll_som  bigint  not null default 0,
  metingen    integer not null default 0,
  primary key (shop, dag, path)
);

create table if not exists public.site_dag_bron (
  shop    text not null,
  dag     date not null,
  bron    text not null,
  sessies integer not null default 0,
  bounces integer not null default 0,
  primary key (shop, dag, bron)
);

create table if not exists public.site_dag_geo (
  shop    text not null,
  dag     date not null,
  country text not null,
  device  text not null,
  sessies integer not null default 0,
  primary key (shop, dag, country, device)
);

create table if not exists public.site_dag_tech (
  shop    text not null,
  dag     date not null,
  soort   text not null,
  waarde  text not null,
  sessies integer not null default 0,
  primary key (shop, dag, soort, waarde)
);

alter table public.site_dag      enable row level security;
alter table public.site_dag_pad  enable row level security;
alter table public.site_dag_bron enable row level security;
alter table public.site_dag_geo  enable row level security;
alter table public.site_dag_tech enable row level security;

-- ── orderboek: welke order al geteld is (idempotente webhook) ─────────────

create table if not exists public.site_orderboek (
  shop       text not null,
  order_id   bigint not null,
  session_id text not null,
  cents      bigint not null,
  gemaakt    timestamptz not null default now(),
  primary key (shop, order_id)
);
alter table public.site_orderboek enable row level security;
create index if not exists site_orderboek_sessie on public.site_orderboek (session_id);

-- ── functies ──────────────────────────────────────────────────────────────

create or replace function public.site_pageview(
  p_sessie text, p_shop text, p_bezoeker text, p_pad text, p_verwijzer text,
  p_utm_source text, p_utm_medium text, p_utm_campaign text, p_land text,
  p_device text, p_nieuw boolean, p_nu timestamptz,
  p_browser text default null, p_os text default null,
  p_taal text default null, p_scherm text default null)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  insert into site_sessies (
    session_id, shop, visitor_id, begonnen, laatst, pageviews, paden,
    instap, uitstap, verwijzer, utm_source, utm_medium, utm_campaign,
    country, device, nieuw, browser, os, taal, scherm,
    zag_collectie, zag_product, zag_cart, zag_checkout
  ) values (
    p_sessie, p_shop, p_bezoeker, p_nu, p_nu, 1, array[p_pad],
    p_pad, p_pad, p_verwijzer, p_utm_source, p_utm_medium, p_utm_campaign,
    p_land, p_device, p_nieuw, p_browser, p_os, p_taal, p_scherm,
    p_pad like '/collections/%', p_pad like '/products/%',
    p_pad like '/cart%', p_pad like '/checkouts%'
  )
  on conflict (session_id) do update set
    laatst        = p_nu,
    pageviews     = site_sessies.pageviews + 1,
    paden         = case when array_length(site_sessies.paden, 1) >= 30
                         then site_sessies.paden else site_sessies.paden || p_pad end,
    uitstap       = p_pad,
    zag_collectie = site_sessies.zag_collectie or p_pad like '/collections/%',
    zag_product   = site_sessies.zag_product   or p_pad like '/products/%',
    zag_cart      = site_sessies.zag_cart      or p_pad like '/cart%',
    zag_checkout  = site_sessies.zag_checkout  or p_pad like '/checkouts%';
end $function$;

create or replace function public.site_vertrek(
  p_sessie text, p_duur integer, p_scroll integer, p_pad text, p_nu timestamptz)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  update site_sessies set
    duur_ms    = least(duur_ms + p_duur, 86400000),
    max_scroll = greatest(max_scroll, p_scroll),
    laatst     = p_nu
  where session_id = p_sessie;
end $function$;

create or replace function public.site_order_toekennen(
  p_shop text, p_order_id bigint, p_sessie text, p_cents bigint)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare nieuw boolean := false;
begin
  insert into site_orderboek (shop, order_id, session_id, cents)
  values (p_shop, p_order_id, p_sessie, greatest(0, p_cents))
  on conflict (shop, order_id) do nothing;

  get diagnostics nieuw = row_count;
  if not nieuw then return false; end if;   -- kenden we al

  update site_sessies
  set orders        = orders + 1,
      omzet_cents   = omzet_cents + greatest(0, p_cents),
      laatste_order = now()
  where session_id = p_sessie;

  return true;
end $function$;

create or replace function public.site_oprollen(vanaf date default (current_date - 2))
returns integer
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare dagen integer;
begin
  delete from site_dag      where dag >= vanaf;
  delete from site_dag_pad  where dag >= vanaf;
  delete from site_dag_bron where dag >= vanaf;
  delete from site_dag_geo  where dag >= vanaf;
  delete from site_dag_tech where dag >= vanaf;

  insert into site_dag (shop, dag, bezoekers, nieuwe, sessies, pageviews, bounces,
                        duur_ms_som, zag_collectie, zag_product, zag_cart, zag_checkout,
                        deed_atc, ging_checkout, orders, omzet_cents)
  select shop, begonnen::date,
         count(distinct visitor_id), count(*) filter (where nieuw), count(*),
         sum(pageviews), count(*) filter (where pageviews <= 1), sum(duur_ms),
         count(*) filter (where zag_collectie), count(*) filter (where zag_product),
         count(*) filter (where zag_cart), count(*) filter (where zag_checkout),
         count(*) filter (where deed_atc), count(*) filter (where ging_checkout),
         sum(orders), sum(omzet_cents)
  from site_sessies where begonnen::date >= vanaf
  group by shop, begonnen::date;
  get diagnostics dagen = row_count;

  insert into site_dag_pad (shop, dag, path, pageviews, instappen, uitstappen,
                            duur_ms_som, scroll_som, metingen)
  select s.shop, s.begonnen::date, p.pad, count(*),
         count(*) filter (where p.pad = s.instap and p.nr = 1),
         count(*) filter (where p.pad = s.uitstap and p.nr = array_length(s.paden, 1)),
         0, 0, 0
  from site_sessies s, lateral unnest(s.paden) with ordinality as p(pad, nr)
  where s.begonnen::date >= vanaf
  group by s.shop, s.begonnen::date, p.pad;

  update site_dag_pad d
  set duur_ms_som = t.duur, scroll_som = t.scroll, metingen = t.n
  from (select shop, begonnen::date as dag, uitstap as path,
               sum(duur_ms) as duur, sum(max_scroll) as scroll, count(*) as n
        from site_sessies where begonnen::date >= vanaf and uitstap is not null
        group by shop, begonnen::date, uitstap) t
  where d.shop = t.shop and d.dag = t.dag and d.path = t.path;

  insert into site_dag_bron (shop, dag, bron, sessies, bounces)
  select shop, begonnen::date,
         coalesce(nullif(utm_source,''), nullif(verwijzer,''), 'direct'),
         count(*), count(*) filter (where pageviews <= 1)
  from site_sessies where begonnen::date >= vanaf group by 1,2,3;

  insert into site_dag_geo (shop, dag, country, device, sessies)
  select shop, begonnen::date, coalesce(nullif(country,''),'??'),
         coalesce(nullif(device,''),'unknown'), count(*)
  from site_sessies where begonnen::date >= vanaf group by 1,2,3,4;

  insert into site_dag_tech (shop, dag, soort, waarde, sessies)
  select shop, begonnen::date, s.soort, s.waarde, count(*)
  from site_sessies,
       lateral (values ('browser', coalesce(nullif(browser,''), 'unknown')),
                       ('os',      coalesce(nullif(os,''),      'unknown'))) as s(soort, waarde)
  where begonnen::date >= vanaf
  group by 1,2,3,4;

  return dagen;
end $function$;

create or replace function public.site_opruimen()
returns table(opgerolde_dagen integer, verwijderde_sessies integer)
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  bewaar constant integer := 30;
  grens  date;
  dagen  integer;
  weg    integer;
begin
  grens := (current_date - bewaar)::date;

  -- Eerst oprollen tot voorbij de grens, dan pas verwijderen. Andersom zou
  -- de laatste dag ongerold verdwijnen, en dat gat is niet meer te herstellen.
  select site_oprollen(grens - 1) into dagen;

  delete from site_sessies where begonnen < (current_date - bewaar);
  get diagnostics weg = row_count;

  return query select dagen, weg;
end $function$;

-- ── nachtelijke opruiming (30 dagen) ──────────────────────────────────────
-- Alleen als pg_cron er is; op een lokale database zonder die extensie wordt
-- dit stil overgeslagen in plaats van de hele migratie te laten falen.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and not exists (select 1 from cron.job where jobname = 'site-oprollen') then
    perform cron.schedule('site-oprollen', '15 3 * * *', 'select site_opruimen();');
  end if;
end $$;
