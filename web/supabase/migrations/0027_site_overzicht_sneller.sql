-- Het bezoekersscherm was leeg terwijl er 116.000 sessies in de database
-- stonden.
--
-- WAT ER GEBEURDE
-- site_overzicht deed er 10,5 seconde over. De API-rol krijgt acht seconden
-- per verzoek, dus de aanroep werd afgebroken. De loader las overzicht.error
-- niet, dus data was null, kern.sessies werd nul, en het scherm concludeerde
-- "Nothing measured yet" - inclusief de vriendelijke belofte dat de eerste
-- cijfers vanzelf zouden verschijnen.
--
-- In de SQL-editor werkte hij wel: daar staat de limiet op 120 seconden. Dat
-- is precies waarom dit zo lang onzichtbaar bleef.
--
-- WAAR DIE TIEN SECONDEN ZATEN
-- 8,7 ervan in een enkele aggregatie. ontleed maakt van elke sessie elf rijen
-- (een per dimensie), dus 1,2 miljoen, en daar ging een
-- count(distinct visitor_id) overheen, gegroepeerd op dim en waarde.
--
-- count(distinct) dwingt Postgres tot sorteren. Die sortering paste niet in
-- het werkgeheugen en ging naar schijf: "external merge, Disk: 68976kB".
--
-- WAT NIET WERKTE
-- work_mem op de functie zetten. Met 512MB draaide ze even traag als met 64kB,
-- terwijl dezelfde query in een losse testfunctie van 8,7 naar 0,84 seconde
-- ging. Supabase past die instelling per functie niet toe - supautils houdt
-- hem tegen - en dat is van buiten niet te zien.
--
-- WAT WEL WERKT
-- De sortering vermijden in plaats van hem te laten passen. Een select distinct
-- mag Postgres met een hash doen; count(distinct) niet. Dus telt een aparte CTE
-- de unieke bezoekers per dimensiewaarde, en haalt per_dim die waarde op met
-- een join.
--
-- Aangekoppeld met using (dim, waarde), zodat de bestaande selectie- en
-- groepeerregels in per_dim niet ineens dubbelzinnig worden.
--
-- Van 10,5 naar 7,3 seconde. Nagerekend: 116.486 sessies, en mobile, desktop,
-- tablet en unknown tellen exact tot dat totaal op.
--
-- WAT ER NOG STAAT
-- 7,3 seconde is niet snel, het is net binnen de limiet. De echte oplossing is
-- lange bereiken uit site_dag lezen in plaats van uit de sessies - dat pad
-- bestaat al in de loader, maar staat nu pas aan boven de dertig dagen.
do $do$
declare def text;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'site_overzicht';

  if position('dim_bez as (' in def) > 0 then
    raise notice 'staat er al';
    return;
  end if;

  def := replace(def, 'per_dim as (',
    'dim_bez as (' || E'\n' ||
    '  select dim, waarde, count(*) as bezoekers' || E'\n' ||
    '  from (select distinct dim, waarde, visitor_id from ontleed where nu) u' || E'\n' ||
    '  group by dim, waarde' || E'\n' ||
    '),' || E'\n' ||
    'per_dim as (');

  def := replace(def, 'count(distinct visitor_id) filter (where nu)',
                      'coalesce(max(dim_bez.bezoekers), 0)::bigint          ');

  def := replace(def, 'from ontleed group by dim, waarde',
                      'from ontleed left join dim_bez using (dim, waarde) group by dim, waarde');

  if position('dim_bez as (' in def) = 0 then raise exception 'CTE niet ingevoegd'; end if;
  if position('count(distinct visitor_id) filter (where nu)' in def) > 0 then raise exception 'oude aggregatie staat er nog'; end if;
  if position('left join dim_bez using (dim, waarde)' in def) = 0 then raise exception 'join niet gelegd'; end if;

  execute def;
end $do$;

-- En wat marge op de API-limiet. Zeven komma drie tegen acht is geen marge:
-- een drukke dag erbij en het scherm is weer leeg. Twintig seconden geeft
-- ruimte zonder de traagheid te verstoppen - het scherm meldt nu zelf wanneer
-- een vraag afgebroken wordt.
alter role authenticator set statement_timeout = '20s';
