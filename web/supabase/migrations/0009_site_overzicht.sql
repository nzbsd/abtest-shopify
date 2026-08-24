-- Tellen in Postgres in plaats van in Node.
--
-- WAAROM
-- Het scherm haalde alle sessierijen op en telde ze in JavaScript. PostgREST
-- geeft er maximaal duizend terug (de "Max rows"-instelling), en die grens is
-- stil: je krijgt geen fout, je krijgt duizend rijen. Deze winkel doet er
-- drieduizend per dag.
--
-- Zonder ORDER BY zijn dat de duizend oudste, dus alles wat later op de dag
-- gebeurde viel eruit. Conversie stond op nul omdat de orders van vanochtend
-- acht uur simpelweg niet in de duizend zaten. Elk getal op het scherm was om
-- dezelfde reden fout, niet alleen dat ene.
--
-- Het dak verhogen lost het niet op: negentigduizend rijen per keer door een
-- serverless functie duwen om er zes getallen uit te tellen is geen oplossing
-- maar uitstel. Tellen hoort waar de rijen staan.
--
-- ÉÉN FUNCTIE, ÉÉN RIJ TERUG
-- Alles wat het scherm nodig heeft komt als één jsonb terug. Geen rijendak dat
-- ooit nog kan bijten, één keer over de tabel in plaats van elf keer, en de
-- filters gelden overal tegelijk.

create or replace function site_overzicht(
  p_shop         text,
  p_vanaf        timestamptz,
  p_tot          timestamptz,
  p_vorige_vanaf timestamptz,
  p_vorige_tot   timestamptz,
  p_per_uur      boolean default false,
  p_filters      jsonb   default '{}'::jsonb,
  p_max          int     default 12
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with bereik as (
  select s.*,
         (s.begonnen >= p_vanaf        and s.begonnen < p_tot)        as nu,
         (s.begonnen >= p_vorige_vanaf and s.begonnen < p_vorige_tot) as toen
  from site_sessies s
  where s.shop = p_shop
    and (   (s.begonnen >= p_vanaf        and s.begonnen < p_tot)
         or (s.begonnen >= p_vorige_vanaf and s.begonnen < p_vorige_tot) )
),

-- De filters. Elke regel doet niets zolang die sleutel niet gezet is, dus
-- ongefilterd kost dit alleen een handvol null-vergelijkingen. De coalesce-
-- waarden zijn dezelfde als die de lijsten tonen: waar "unknown" in de lijst
-- staat moet je ook op "unknown" kunnen klikken.
sel as (
  select * from bereik
  where (p_filters->>'device'       is null or coalesce(device,  'unknown') = p_filters->>'device')
    and (p_filters->>'browser'      is null or coalesce(browser, 'unknown') = p_filters->>'browser')
    and (p_filters->>'os'           is null or coalesce(os,      'unknown') = p_filters->>'os')
    and (p_filters->>'country'      is null or coalesce(country, '??')      = p_filters->>'country')
    and (p_filters->>'utm_source'   is null or coalesce(utm_source,   '')   = p_filters->>'utm_source')
    and (p_filters->>'utm_medium'   is null or coalesce(utm_medium,   '')   = p_filters->>'utm_medium')
    and (p_filters->>'utm_campaign' is null or coalesce(utm_campaign, '')   = p_filters->>'utm_campaign')
    and (p_filters->>'instap'       is null or coalesce(instap,  '')        = p_filters->>'instap')
    and (p_filters->>'uitstap'      is null or coalesce(uitstap, '')        = p_filters->>'uitstap')
    and (p_filters->>'nieuw'        is null or (case when nieuw then 'new' else 'returning' end)
                                             = p_filters->>'nieuw')
    and (p_filters->>'bron'         is null or coalesce(nullif(utm_source,''),
                                                        nullif(verwijzer,''), 'direct')
                                             = p_filters->>'bron')
    -- Onderweg langsgekomen, niet "begon ermee" of "eindigde erop": daar zijn
    -- instap en uitstap voor.
    and (p_filters->>'pad'          is null or (p_filters->>'pad') = any(coalesce(paden, '{}')))
),

-- ── kengetallen ────────────────────────────────────────────────────────────
kern as (
  select
    count(*)                                                     as sessies,
    count(distinct visitor_id)                                   as bezoekers,
    count(*) filter (where nieuw)                                as nieuwe,
    coalesce(sum(pageviews), 0)                                  as pageviews,
    count(*) filter (where coalesce(pageviews, 0) <= 1)          as bounces,
    coalesce(sum(duur_ms), 0)                                    as duur_ms,
    coalesce(sum(orders), 0)                                     as orders,
    coalesce(sum(omzet_cents), 0)                                as omzet_cents,
    count(*) filter (where zag_collectie)                        as zag_collectie,
    count(*) filter (where zag_product)                          as zag_product,
    count(*) filter (where zag_cart)                             as zag_cart,
    count(*) filter (where zag_checkout)                         as zag_checkout,
    count(*) filter (where deed_atc)                             as deed_atc,
    count(*) filter (where ging_checkout)                        as ging_checkout
  from sel where nu
),
kern_toen as (
  select
    count(*)                                                     as sessies,
    count(distinct visitor_id)                                   as bezoekers,
    count(*) filter (where nieuw)                                as nieuwe,
    coalesce(sum(pageviews), 0)                                  as pageviews,
    count(*) filter (where coalesce(pageviews, 0) <= 1)          as bounces,
    coalesce(sum(duur_ms), 0)                                    as duur_ms,
    coalesce(sum(orders), 0)                                     as orders,
    coalesce(sum(omzet_cents), 0)                                as omzet_cents,
    count(*) filter (where zag_collectie)                        as zag_collectie,
    count(*) filter (where zag_product)                          as zag_product,
    count(*) filter (where zag_cart)                             as zag_cart,
    count(*) filter (where zag_checkout)                         as zag_checkout,
    count(*) filter (where deed_atc)                             as deed_atc,
    count(*) filter (where ging_checkout)                        as ging_checkout
  from sel where toen
),

-- Alleen het meetbare deel: cart, kassa en orders komen uit het thema-snippet
-- en zijn structureel nul voor het moment dat dat in het thema stond.
signaal as (
  select min(begonnen) as vanaf from site_sessies
  where shop = p_shop and deed_atc
),
kern_sinds as (
  select
    count(*)                                            as sessies,
    count(distinct visitor_id)                          as bezoekers,
    coalesce(sum(orders), 0)                            as orders,
    coalesce(sum(omzet_cents), 0)                       as omzet_cents,
    count(*) filter (where deed_atc)                    as deed_atc,
    count(*) filter (where ging_checkout)               as ging_checkout,
    count(*) filter (where zag_product)                 as zag_product
  from sel, signaal
  where nu and signaal.vanaf is not null and begonnen >= signaal.vanaf
),
voor_signaal as (
  select count(*) as n from sel, signaal
  where nu and signaal.vanaf is not null and begonnen < signaal.vanaf
),

-- ── lijsten ────────────────────────────────────────────────────────────────
-- Elf dimensies in één keer: de sessie wordt uitgeklapt naar één regel per
-- dimensie en daarna gegroepeerd. Elf losse queries zouden elf keer over
-- dezelfde rijen lopen voor hetzelfde antwoord.
ontleed as (
  select sel.nu, sel.toen, sel.visitor_id, sel.pageviews, sel.duur_ms,
         sel.orders, sel.omzet_cents, d.dim, d.waarde
  from sel
  cross join lateral (values
    ('instap',       nullif(sel.instap, '')),
    ('uitstap',      nullif(sel.uitstap, '')),
    ('bron',         coalesce(nullif(sel.utm_source, ''), nullif(sel.verwijzer, ''), 'direct')),
    ('utm_source',   nullif(sel.utm_source, '')),
    ('utm_medium',   nullif(sel.utm_medium, '')),
    ('utm_campaign', nullif(sel.utm_campaign, '')),
    ('country',      coalesce(nullif(sel.country, ''), '??')),
    ('device',       coalesce(nullif(sel.device, ''), 'unknown')),
    ('browser',      coalesce(nullif(sel.browser, ''), 'unknown')),
    ('os',           coalesce(nullif(sel.os, ''), 'unknown')),
    ('nieuw',        case when sel.nieuw then 'new' else 'returning' end)
  ) as d(dim, waarde)
  where d.waarde is not null
),
per_dim as (
  select dim, waarde,
    count(*) filter (where nu)                                        as sessies,
    count(distinct visitor_id) filter (where nu)                      as bezoekers,
    coalesce(sum(pageviews) filter (where nu), 0)                     as pageviews,
    count(*) filter (where nu and coalesce(pageviews, 0) <= 1)        as bounces,
    coalesce(sum(duur_ms) filter (where nu), 0)                       as duur_ms,
    coalesce(sum(orders) filter (where nu), 0)                        as orders,
    coalesce(sum(omzet_cents) filter (where nu), 0)                   as omzet_cents,
    count(*) filter (where toen)                                      as vorige_sessies
  from ontleed group by dim, waarde
),
-- Alleen waarden die in de huidige periode voorkomen. Een bron die vorige week
-- bestond en nu niet meer hoort niet in een lijst over deze week.
gerangschikt as (
  select *, row_number() over (partition by dim order by sessies desc, waarde) as rang
  from per_dim where sessies > 0
),
lijsten as (
  select dim, jsonb_agg(jsonb_build_object(
           'naam', waarde, 'sessies', sessies, 'bezoekers', bezoekers,
           'pageviews', pageviews, 'bounces', bounces, 'duurMs', duur_ms,
           'orders', orders, 'omzetCents', omzet_cents, 'vorigeSessies', vorige_sessies
         ) order by sessies desc, waarde) as rijen
  from gerangschikt
  where rang <= case when dim = 'nieuw' then 2 else p_max end
  group by dim
),

-- ── pagina's ───────────────────────────────────────────────────────────────
pad_pv as (
  select p as path, count(*) as pageviews
  from sel, unnest(coalesce(paden, '{}')) as p
  where nu group by p
),
pad_in as (
  select instap as path, count(*) as instappen,
         count(*) filter (where coalesce(pageviews, 0) <= 1) as bounces
  from sel where nu and coalesce(instap, '') <> '' group by instap
),
pad_uit as (
  select uitstap as path, count(*) as n,
         coalesce(sum(duur_ms), 0) as duur, coalesce(sum(max_scroll), 0) as scroll
  from sel where nu and coalesce(uitstap, '') <> '' group by uitstap
),
pad_sleutels as (
  select path from pad_pv union select path from pad_in union select path from pad_uit
),
paginas as (
  select k.path,
         coalesce(pv.pageviews, 0)  as pageviews,
         coalesce(i.instappen, 0)   as instappen,
         coalesce(i.bounces, 0)     as bounces,
         coalesce(u.n, 0)           as uitstappen,
         case when coalesce(u.n, 0) > 0 then round(u.duur / 1000.0 / u.n) else 0 end   as gem_sec,
         case when coalesce(u.n, 0) > 0 then round(u.scroll::numeric / u.n) else 0 end as gem_scroll
  from pad_sleutels k
  left join pad_pv  pv on pv.path = k.path
  left join pad_in  i  on i.path  = k.path
  left join pad_uit u  on u.path  = k.path
  order by 2 desc limit 30
),

-- ── routes ─────────────────────────────────────────────────────────────────
routes as (
  select array_to_string((paden)[1:4], ' → ')
         || case when coalesce(array_length(paden, 1), 0) > 4 then ' → …' else '' end as route,
         count(*) as sessies, coalesce(sum(orders), 0) as orders
  from sel
  where nu and coalesce(array_length(paden, 1), 0) >= 2
  group by 1 order by 2 desc limit 10
),

-- ── tijdreeks ──────────────────────────────────────────────────────────────
-- De labels zijn dezelfde als het scherm verwacht: uur bij vandaag, anders
-- datum, allebei in UTC. Welke bakken er moeten zijn bepaalt het scherm; hier
-- staat alleen wat er ín zit.
punt_nu as (
  select case when p_per_uur then to_char(begonnen at time zone 'UTC', 'HH24') || ':00'
              else to_char(begonnen at time zone 'UTC', 'YYYY-MM-DD') end as label,
         count(distinct visitor_id)            as bezoekers,
         count(*)                              as sessies,
         coalesce(sum(pageviews), 0)           as pageviews,
         coalesce(sum(orders), 0)              as orders,
         coalesce(sum(omzet_cents), 0)         as omzet_cents
  from sel where nu group by 1
),
-- De vergelijkingsreeks op positie, niet op datum: anders valt hij naast de
-- huidige in plaats van eronder.
punt_toen as (
  select case when p_per_uur then to_char(begonnen at time zone 'UTC', 'HH24') || ':00'
              else to_char(begonnen at time zone 'UTC', 'YYYY-MM-DD') end as label,
         count(*) as sessies
  from sel where toen group by 1
),

-- ── realtime ───────────────────────────────────────────────────────────────
recent as (
  select floor(extract(epoch from (now() - laatst)) / 60)::int as min_geleden
  from site_sessies
  where shop = p_shop and laatst >= now() - interval '30 minutes'
),

detail as (select min(begonnen) as tot from site_sessies where shop = p_shop)

select jsonb_build_object(
  'kern',        (select to_jsonb(k) from kern k),
  'vorige',      (select case when k.sessies > 0 then to_jsonb(k) end from kern_toen k),
  'signaalVanaf', (select vanaf from signaal),
  'kernSinds',   (select to_jsonb(k) from kern_sinds k),
  'voorSignaal', (select n from voor_signaal),
  'lijsten',     coalesce((select jsonb_object_agg(dim, rijen) from lijsten), '{}'::jsonb),
  'paginas',     coalesce((select jsonb_agg(jsonb_build_object(
                    'path', path, 'pageviews', pageviews, 'instappen', instappen,
                    'uitstappen', uitstappen, 'bounces', bounces,
                    'gemSec', gem_sec, 'gemScroll', gem_scroll)) from paginas), '[]'::jsonb),
  'routes',      coalesce((select jsonb_agg(jsonb_build_object(
                    'route', route, 'sessies', sessies, 'orders', orders)) from routes), '[]'::jsonb),
  'puntenNu',    coalesce((select jsonb_object_agg(label, jsonb_build_object(
                    'bezoekers', bezoekers, 'sessies', sessies, 'pageviews', pageviews,
                    'orders', orders, 'omzetCents', omzet_cents)) from punt_nu), '{}'::jsonb),
  'puntenToen',  coalesce((select jsonb_agg(sessies order by label) from punt_toen), '[]'::jsonb),
  'nu',          (select count(*) from recent where min_geleden < 5),
  'realtime',    coalesce((select jsonb_agg(coalesce(t.n, 0) order by t.i)
                    from (select i, (select count(*) from recent r where r.min_geleden = 29 - i) as n
                          from generate_series(0, 29) as i) t), '[]'::jsonb),
  'detailTot',   (select to_char(tot, 'YYYY-MM-DD') from detail)
);
$$;

-- Alleen de app draait dit, en die praat als service_role. De storefront heeft
-- hier niets te zoeken: dit is de hele bezoekersgeschiedenis in één antwoord.
revoke all on function site_overzicht(text, timestamptz, timestamptz, timestamptz,
                                      timestamptz, boolean, jsonb, int) from public, anon, authenticated;
