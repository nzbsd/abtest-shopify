-- Het levende deel, los van de zware paginaquery.
--
-- WAAROM APART
-- site_overzicht rekent de hele gekozen periode door - vierduizend sessies
-- uitgeklapt naar elf dimensies, pagina's, routes, de tijdreeks. Driehonderd-
-- vijftig milliseconde, en terecht: je vraagt er ook alles voor op.
--
-- Maar "wie is er nu" is een andere vraag, en die wil je elke vijftien seconden
-- stellen. Dat kan niet met de eerste query. Dit zijn drie indexscans over het
-- laatste half uur: drie milliseconde.

-- Wanneer de laatste order op deze sessie binnenkwam.
--
-- Zonder tijdstempel kan het scherm alleen tellingen vergelijken tussen twee
-- pollrondes, en dan mis je een order zodra er twee in hetzelfde venster vallen
-- of eentje uit het venster loopt. Met een tijdstempel vraagt het scherm gewoon
-- "wat is er sinds dit moment gebeurd" en klopt het altijd.
alter table site_sessies add column if not exists laatste_order timestamptz;

create index if not exists site_sessies_order_tijd
  on site_sessies (shop, laatste_order desc)
  where laatste_order is not null;

create or replace function site_order(p_sessie text, p_cents bigint)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  update site_sessies
  set orders = orders + 1,
      omzet_cents = omzet_cents + greatest(0, p_cents),
      laatste_order = now()
  where session_id = p_sessie;
end $function$;

-- Waar de winkel zelf staat, voor de boog van bezoeker naar winkel. Eén rij per
-- winkel, bijgewerkt door de app-schil die het bij Shopify kan opvragen; het
-- losse dashboard heeft geen admin-verbinding en leest hem hier.
create table if not exists site_winkel (
  shop        text primary key,
  land        text,
  bijgewerkt  timestamptz not null default now()
);
alter table site_winkel enable row level security;

create or replace function site_live(p_shop text, p_sinds timestamptz default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with levend as (
  select coalesce(nullif(country, ''), '??') as land, count(*) as actief
  from site_sessies
  where shop = p_shop and laatst >= now() - interval '5 minutes'
  group by 1
),
verse_orders as (
  select coalesce(nullif(country, ''), '??') as land,
         omzet_cents as cents,
         laatste_order as op
  from site_sessies
  where shop = p_shop
    and laatste_order is not null
    -- Zonder p_sinds is er geen "sinds", en dan is er ook geen nieuws. De
    -- eerste ronde zet alleen de klok gelijk; pas de tweede kan iets melden.
    -- Anders krijg je bij het openen de laatste minuten als vuurwerk.
    and p_sinds is not null
    and laatste_order > p_sinds
    and laatste_order > now() - interval '10 minutes'   -- vangnet tegen een oude p_sinds
  order by laatste_order
  limit 25
)
select jsonb_build_object(
  'nu',      (select coalesce(sum(actief), 0) from levend),
  'landen',  coalesce((select jsonb_agg(jsonb_build_object('land', land, 'actief', actief)
                       order by actief desc) from levend), '[]'::jsonb),
  'orders',  coalesce((select jsonb_agg(jsonb_build_object('land', land, 'cents', cents, 'op', op)
                       order by op) from verse_orders), '[]'::jsonb),
  'winkelLand', (select land from site_winkel where shop = p_shop),
  'op',      now()
);
$$;

-- Alleen de app draait dit, en die praat als service_role.
revoke all on function site_live(text, timestamptz) from public, anon, authenticated;
