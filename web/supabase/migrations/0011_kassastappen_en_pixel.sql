-- De stappen ín de kassa, en de stand van de web pixel.
--
-- WAAROM DIT ER IS
-- Het thema-snippet ziet de kassa niet: Shopify rendert daar geen themacode.
-- Tussen "checkout gestart" en "besteld" zat daardoor een zwart gat - bij deze
-- winkel beginnen er vierentwintig mensen aan een cart, lopen er dertien door
-- de kassa, en waar die elf afhaakten wisten we niet.
--
-- Een web pixel draait er wel. Die komt uit de app in plaats van uit het thema,
-- dus een thema-update gooit hem niet weg, en hij honoreert de Customer Privacy
-- API - wat betekent dat deze getallen lager liggen dan wat het snippet meet,
-- en dat dat de bedoeling is.

alter table site_sessies
  add column if not exists deed_contact    boolean not null default false,
  add column if not exists deed_verzending boolean not null default false,
  add column if not exists deed_betaling   boolean not null default false;

create or replace function site_signaal(p_sessie text, p_soort text, p_nu timestamptz)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  update site_sessies set
    deed_atc      = deed_atc      or p_soort = 'atc',
    ging_checkout = ging_checkout or p_soort = 'checkout',
    zag_cart      = zag_cart      or p_soort in ('atc', 'checkout'),
    zag_checkout  = zag_checkout  or p_soort = 'checkout',

    -- Elke stap zet ook de stap ervóór, want zo werkt een kassa: je komt niet
    -- bij betalen zonder verzending. De pixel kan er eentje missen - een
    -- weggeklikt tabblad, een verbinding die wegvalt - en dan hoort de trechter
    -- niet ineens breder te worden verderop.
    deed_contact    = deed_contact    or p_soort in ('contact', 'verzending', 'betaling', 'afgerekend'),
    deed_verzending = deed_verzending or p_soort in ('verzending', 'betaling', 'afgerekend'),
    deed_betaling   = deed_betaling   or p_soort in ('betaling', 'afgerekend'),

    laatst        = greatest(laatst, p_nu)
  where session_id = p_sessie;
end $function$;

-- Onthouden dat de pixel aanstaat en met welke instellingen, zodat er niet bij
-- elke paginaweergave een GraphQL-vraag naar Shopify gaat om iets te bevestigen
-- dat alleen verandert als de app-URL verandert.
alter table site_winkel
  add column if not exists pixel_at        timestamptz,
  add column if not exists pixel_settings  text;

-- De drie stappen ook in het overzicht. site_overzicht wordt hier niet
-- opnieuw uitgeschreven; de drie tellingen zijn met een gerichte vervanging aan
-- elk van de drie kernblokken toegevoegd:
--
--   count(*) filter (where deed_contact)    as deed_contact,
--   count(*) filter (where deed_verzending) as deed_verzending,
--   count(*) filter (where deed_betaling)   as deed_betaling

-- Waarom de pixel niet aanging. Stond eerst in een lege catch, en dat is
-- precies de fout waar je nooit achter komt.
alter table site_winkel
  add column if not exists pixel_fout      text,
  add column if not exists pixel_gepoogd   timestamptz;
