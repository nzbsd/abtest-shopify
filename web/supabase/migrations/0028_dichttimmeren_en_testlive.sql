-- Twee dingen: de deur dicht, en een live blik per test.
--
-- ═══ 1. DE DEUR DICHT ═══════════════════════════════════════════════════════
--
-- Gecontroleerd op 6 oktober in de live database, niet aangenomen:
--
--  * price_test_stats en price_test_daily draaiden als hun eigenaar. 0026 maakte
--    ze opnieuw met `create or replace view` zonder `with (security_invoker)`,
--    en dat VERVANGT de opties - de security_invoker uit 0001/0002 was weg. Met
--    de standaard SELECT-rechten van anon kon iedereen met de publieke anon-key
--    (die in de popup-app op de storefront staat) de omzet, orders en bezoekers
--    van elke test van elke winkel lezen.
--
--  * site_order, site_order_toekennen, site_order_via_bezoeker en site_signaal
--    zijn SECURITY DEFINER en waren uitvoerbaar door anon. Iemand met de anon-key
--    kon daarmee orders en kassastappen in het bezoekersscherm schrijven.
--
-- Deze app praat alleen als service_role. anon en authenticated hebben hier
-- dus niets te zoeken, en de rechten gaan er helemaal af - niet alleen op wat
-- nu lek bleek, maar op alles van deze app, zodat de volgende `create or
-- replace` niet weer stil een gat slaat.

alter view public.price_test_stats set (security_invoker = true);
alter view public.price_test_daily set (security_invoker = true);

do $$
declare r record;
begin
  -- Tabellen en views van deze app.
  for r in
    select c.oid::regclass as obj
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'v', 'm')
      and (c.relname like 'price_test%' or c.relname like 'site\_%')
  loop
    execute format('revoke all on %s from anon, authenticated', r.obj);
    execute format('grant all on %s to service_role', r.obj);
  end loop;

  -- Functies van deze app. PUBLIC ook: daar erven anon en authenticated van.
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'site\_%' or p.proname like 'price_test%' or p.proname = 'test_live')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.fn);
    execute format('grant execute on function %s to service_role', r.fn);
  end loop;
end $$;

-- ═══ 2. LIVE PER TEST ═══════════════════════════════════════════════════════
--
-- Wie zit er nu in welke variant, en hoe ver is hij: kijkt, cart, kassa,
-- gekocht. Eén vraag elke tien seconden, dus alleen het laatste stukje tijd.
--
-- Twee bronnen samen:
--  * price_test_events zegt in WELKE groep iemand zit (view), of hij in deze
--    test iets in de cart legde (atc) en of hij kocht (purchase, uit de
--    ondertekende webhook).
--  * site_sessies zegt of hij er NU nog is, op welke pagina, en hoe ver hij in
--    de kassa kwam (de web pixel: contact, verzending, betaling).
--
-- Lidmaatschap kijkt drie uur terug: iemand die om twee uur de testpagina zag en
-- nu afrekent, hoort er nog bij. Activiteit kijkt vijftien minuten terug.

create index if not exists price_test_events_test_tijd
  on public.price_test_events (test_id, created_at desc);

create or replace function public.test_live(p_shop text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
with lopend as (
  select t.id,
         coalesce(nullif(t.naam, ''), initcap(t.test_type) || ' test #' || t.id) as naam,
         t.test_type, t.split_pct, t.started_at,
         array_remove(array[
           case when t.control_product_handle is not null then '/products/' || t.control_product_handle end,
           case when t.test_product_handle    is not null then '/products/' || t.test_product_handle end,
           nullif(t.control_url, ''),
           nullif(t.test_url, '')
         ], null) as paden
  from price_tests t
  where t.shop = p_shop and t.status = 'running'
),
ev as (
  select e.test_id, e.visitor_id,
         (array_agg(e.cohort order by e.created_at desc))[1] as cohort,
         max(e.created_at) as laatst,
         bool_or(e.event_type = 'atc'      and e.created_at >= now() - interval '15 minutes') as atc,
         bool_or(e.event_type = 'checkout' and e.created_at >= now() - interval '15 minutes') as kassa,
         count(*) filter (where e.event_type = 'purchase' and e.created_at >= now() - interval '15 minutes') as orders,
         coalesce(sum(e.revenue_cents) filter (
           where e.event_type = 'purchase' and e.created_at >= now() - interval '15 minutes'), 0) as omzet,
         coalesce(bool_or(e.is_subscription) filter (
           where e.event_type = 'purchase' and e.created_at >= now() - interval '15 minutes'), false) as abo
  from price_test_events e
  join lopend l on l.id = e.test_id
  where e.shop = p_shop
    and e.visitor_id is not null
    and e.created_at >= greatest(l.started_at, now() - interval '3 hours')
  group by 1, 2
),
sess as (
  select distinct on (s.visitor_id)
         s.visitor_id, s.laatst, s.uitstap, s.country, s.device,
         (s.zag_checkout or s.ging_checkout or s.checkout_pixel) as kassa,
         s.deed_contact, s.deed_verzending, s.deed_betaling
  from site_sessies s
  where s.shop = p_shop
    and s.laatst >= now() - interval '15 minutes'
    and s.visitor_id in (select visitor_id from ev)
  order by s.visitor_id, s.laatst desc
),
mens as (
  select ev.test_id, ev.visitor_id, ev.cohort,
         greatest(ev.laatst, s.laatst) as laatst,
         s.uitstap as pagina, s.country as land, s.device,
         ev.atc,
         (ev.kassa or coalesce(s.kassa, false)) as kassa,
         ev.orders, ev.omzet, ev.abo,
         case
           when ev.orders > 0                 then 'gekocht'
           when s.deed_betaling               then 'betaling'
           when s.deed_verzending             then 'verzending'
           when s.deed_contact                then 'contact'
           when ev.kassa or s.kassa           then 'kassa'
           when ev.atc                        then 'cart'
           else 'bekijkt'
         end as stap,
         exists (
           select 1 from lopend l, unnest(l.paden) p
           where l.id = ev.test_id and s.uitstap is not null
             and (s.uitstap = p or s.uitstap like '%' || p)
         ) as op_pagina,
         (select cardinality(l.paden) = 0 from lopend l where l.id = ev.test_id) as overal
  from ev
  left join sess s on s.visitor_id = ev.visitor_id
  where greatest(ev.laatst, s.laatst) >= now() - interval '15 minutes'
),
vandaag as (
  select e.test_id, e.cohort,
         count(*) as orders,
         coalesce(sum(e.revenue_cents), 0) as omzet,
         count(*) filter (where e.is_subscription) as abo
  from price_test_events e
  join lopend l on l.id = e.test_id
  where e.shop = p_shop
    and e.event_type = 'purchase'
    and e.created_at >= greatest(l.started_at,
          date_trunc('day', now() at time zone 'Europe/Amsterdam') at time zone 'Europe/Amsterdam')
  group by 1, 2
)
select jsonb_build_object(
  'op', now(),
  'tests', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', l.id,
      'naam', l.naam,
      'type', l.test_type,
      'split', l.split_pct,
      'paden', to_jsonb(l.paden),
      'groepen', (
        select jsonb_object_agg(g.cohort, jsonb_build_object(
          'nu',        (select count(*) from mens m where m.test_id = l.id and m.cohort = g.cohort
                          and m.laatst >= now() - interval '5 minutes'),
          'opPagina',  (select count(*) from mens m where m.test_id = l.id and m.cohort = g.cohort
                          and m.laatst >= now() - interval '5 minutes' and (m.op_pagina or m.overal)),
          'cart',      (select count(*) from mens m where m.test_id = l.id and m.cohort = g.cohort and m.atc),
          'kassa',     (select count(*) from mens m where m.test_id = l.id and m.cohort = g.cohort
                          and m.kassa and m.orders = 0),
          'gekocht',   (select coalesce(sum(m.orders), 0) from mens m where m.test_id = l.id and m.cohort = g.cohort),
          'omzet',     (select coalesce(sum(m.omzet), 0) from mens m where m.test_id = l.id and m.cohort = g.cohort),
          'vandaagOrders', coalesce((select v.orders from vandaag v where v.test_id = l.id and v.cohort = g.cohort), 0),
          'vandaagOmzet',  coalesce((select v.omzet  from vandaag v where v.test_id = l.id and v.cohort = g.cohort), 0),
          'vandaagAbo',    coalesce((select v.abo    from vandaag v where v.test_id = l.id and v.cohort = g.cohort), 0)
        ))
        from (values ('control'), ('test')) as g(cohort)
      ),
      'mensen', coalesce((
        select jsonb_agg(jsonb_build_object(
                 -- Geen bezoekers-id naar buiten: voor een ingelogde klant is
                 -- dat zijn klantnummer. Een korte hash is genoeg om dezelfde
                 -- persoon tussen twee rondes te herkennen.
                 'wie',    left(md5(m.visitor_id), 6),
                 'klant',  m.visitor_id like 'c%',
                 'groep',  m.cohort,
                 'stap',   m.stap,
                 'land',   m.land,
                 'device', m.device,
                 'pagina', m.pagina,
                 'cents',  m.omzet,
                 'abo',    m.abo,
                 'sec',    floor(extract(epoch from now() - m.laatst))::int
               ) order by m.laatst desc)
        from (select * from mens m2 where m2.test_id = l.id order by m2.laatst desc limit 60) m
      ), '[]'::jsonb)
    ) order by l.id desc)
    from lopend l
  ), '[]'::jsonb)
);
$$;

revoke all on function public.test_live(text) from public, anon, authenticated;
grant execute on function public.test_live(text) to service_role;
