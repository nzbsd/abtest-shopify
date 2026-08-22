-- Spreiding en startmoment toevoegen aan price_test_stats, zodat de app kan
-- toetsen of een verschil echt is in plaats van alleen een gemiddelde te tonen.
--
-- De nieuwe kolommen staan ACHTERAAN en niet op een logische plek in het
-- midden: create or replace view mag bestaande kolommen niet hernoemen of
-- verschuiven, alleen aanvullen. Dat is ook precies waarom dit veilig is - wat
-- er al stond blijft ongemoeid.
--
-- Bezoekers die niets kochten tellen als omzet nul: die dragen niets bij aan de
-- som van kwadraten, wel aan het aantal bezoekers. Dat is wat "omzet per
-- bezoeker" betekent, en het is de reden dat de spreiding zo groot is - de
-- meeste waarnemingen zijn nul en een enkele order is een uitschieter.

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
  max(e.created_at)                                 as last_event_at,
  coalesce(sum(e.revenue_cents::numeric * e.revenue_cents::numeric)
           filter (where e.event_type = 'purchase'), 0) as revenue_sq_cents,
  min(e.created_at)                                 as first_event_at
from public.price_test_events e
group by e.shop, e.test_id, e.cohort, e.market;
