-- Ordercijfers van een test in een enkele opdracht.
--
-- Het resultatenscherm haalde ze op bij Shopify: pagina voor pagina, tot
-- vijfentwintig pagina's per test, met alle regelitems erbij. Voor een test die
-- een week loopt is dat elke schermbeurt opnieuw duizenden orders, en dat is de
-- reden dat het scherm traag opende.
--
-- Alles wat het scherm nodig heeft staat al in price_test_events. De vier
-- groeperingen - totaal, per dag, per variant en per valuta - gaan hier in een
-- enkele jsonb, zodat er geen rijlimiet en geen tweede rondgang aan te pas komt.
--
-- Van Shopify blijft over wat er nodig is om te weten of deze tabel compleet
-- is: twee aantallen in een enkel verzoek. Zie orders.server.ts.
--
-- revenue_sq is de som van de kwadraten: die heeft de significantietoets nodig
-- om de spreiding te kennen.

create or replace function price_test_ordercijfers(p_shop text, p_test_id bigint)
returns jsonb
language sql
stable
as $$
  with p as (
    select cohort,
           coalesce(revenue_cents, 0)                       as cents,
           coalesce(units, 0)                               as units,
           coalesce(is_subscription, false)                 as sub,
           coalesce(nullif(variant_title, ''), '(default)') as variant,
           coalesce(nullif(currency, ''), '?')              as valuta,
           to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as dag
    from price_test_events
    where shop = p_shop
      and test_id = p_test_id
      and event_type = 'purchase'
      and cohort in ('control', 'test')
  ),
  cijfers as (
    select cohort,
           count(*)                                     as orders,
           sum(units)                                   as units,
           sum(cents)                                   as revenue_cents,
           sum(cents::numeric * cents::numeric)         as revenue_sq_cents,
           count(*) filter (where sub)                  as sub_orders,
           coalesce(sum(cents) filter (where sub), 0)   as sub_revenue_cents
    from p group by cohort
  ),
  per as (
    select 'dag' as soort, dag as sleutel, cohort,
           count(*) o, sum(units) u, sum(cents) r,
           sum(cents::numeric * cents::numeric) rq,
           count(*) filter (where sub) so,
           coalesce(sum(cents) filter (where sub), 0) sr
    from p group by dag, cohort
    union all
    select 'variant', variant, cohort, count(*), sum(units), sum(cents),
           sum(cents::numeric * cents::numeric),
           count(*) filter (where sub), coalesce(sum(cents) filter (where sub), 0)
    from p group by variant, cohort
    union all
    select 'valuta', valuta, cohort, count(*), sum(units), sum(cents),
           sum(cents::numeric * cents::numeric),
           count(*) filter (where sub), coalesce(sum(cents) filter (where sub), 0)
    from p group by valuta, cohort
  ),
  gebundeld as (
    select soort, sleutel,
           jsonb_object_agg(cohort, jsonb_build_object(
             'orders', o, 'units', u, 'revenueCents', r,
             'revenueSqCents', rq, 'subOrders', so, 'subRevenueCents', sr)) as per_cohort
    from per group by soort, sleutel
  )
  select jsonb_build_object(
    'totaal', coalesce((
      select jsonb_object_agg(cohort, jsonb_build_object(
        'orders', orders, 'units', units, 'revenueCents', revenue_cents,
        'revenueSqCents', revenue_sq_cents, 'subOrders', sub_orders,
        'subRevenueCents', sub_revenue_cents)) from cijfers), '{}'::jsonb),
    'perDag',     coalesce((select jsonb_object_agg(sleutel, per_cohort) from gebundeld where soort = 'dag'), '{}'::jsonb),
    'perVariant', coalesce((select jsonb_object_agg(sleutel, per_cohort) from gebundeld where soort = 'variant'), '{}'::jsonb),
    'perValuta',  coalesce((select jsonb_object_agg(sleutel, per_cohort) from gebundeld where soort = 'valuta'), '{}'::jsonb)
  );
$$;

revoke all on function price_test_ordercijfers(text, bigint) from anon, authenticated;
