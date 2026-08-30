-- De kassastap in de trechter.
--
-- Het snippet detecteerde al wanneer iemand naar de kassa gaat, maar stuurde
-- dat alleen naar de site-analytics: daar telt het mee voor de hele winkel en
-- nergens per testgroep. Elke trechter sprong daardoor van "winkelwagen" recht
-- naar "order", terwijl juist daartussen de meeste mensen afhaken - en dat is
-- precies waar een kassatest iets aan probeert te doen.
--
-- checkouts staat achteraan in beide views, niet op zijn logische plek tussen
-- add_to_carts en orders. Dat is geen slordigheid: create or replace view mag
-- geen kolommen tussenvoegen of hernoemen, en de views droppen zou alles wat
-- eraan hangt meenemen. Alles leest op naam, dus de volgorde doet niets.
--
-- Bij een kassatest is dit getal gelijk aan views: die test meet pas ín de
-- kassa. Bij een prijs- of templatetest is het de stap die er niet was.
create or replace view public.price_test_stats as
 select shop, test_id, cohort, market,
    count(*) filter (where event_type = 'view')     as views,
    count(*) filter (where event_type = 'atc')      as add_to_carts,
    count(*) filter (where event_type = 'purchase') as orders,
    coalesce(sum(revenue_cents) filter (where event_type = 'purchase'), 0::numeric) as revenue_cents,
    count(distinct visitor_id) filter (where event_type = 'view') as visitors,
    max(created_at) as last_event_at,
    coalesce(sum(revenue_cents::numeric * revenue_cents::numeric)
             filter (where event_type = 'purchase'), 0::numeric) as revenue_sq_cents,
    min(created_at) as first_event_at,
    count(*) filter (where event_type = 'checkout') as checkouts
   from price_test_events e
  group by shop, test_id, cohort, market;

create or replace view public.price_test_daily as
 select shop, test_id, cohort,
    (created_at at time zone 'UTC')::date as dag,
    count(*) filter (where event_type = 'view')     as views,
    count(*) filter (where event_type = 'atc')      as add_to_carts,
    count(*) filter (where event_type = 'purchase') as orders,
    coalesce(sum(revenue_cents) filter (where event_type = 'purchase'), 0::numeric) as revenue_cents,
    count(distinct visitor_id) filter (where event_type = 'view') as visitors,
    count(*) filter (where event_type = 'checkout') as checkouts
   from price_test_events e
  group by shop, test_id, cohort, ((created_at at time zone 'UTC')::date);

-- En de grendel op event_type erbij.
--
-- Die stond op ('view','atc','purchase') en hield de nieuwe soort tegen. Van
-- buiten was daar niets van te zien: het eindpunt geeft altijd 200 terug -
-- met opzet, want anders blijft sendBeacon het opnieuw proberen - dus het
-- snippet meldde netjes, de server antwoordde netjes, en de rij verdween.
--
-- Dit is dezelfde soort fout als product_id die op NOT NULL stond: een
-- afspraak uit de begintijd die niemand meer ziet tot er iets nieuws bijkomt.
-- Het loont om bij een nieuwe gebeurtenissoort of een nieuw testtype eerst
-- hier te kijken.
alter table public.price_test_events
  drop constraint if exists price_test_events_event_type_check;

alter table public.price_test_events
  add constraint price_test_events_event_type_check
  check (event_type in ('view', 'atc', 'checkout', 'purchase'));
