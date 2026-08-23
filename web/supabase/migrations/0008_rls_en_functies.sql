-- Alles wat de bezoekersanalytics toevoegde dichtgezet.
--
-- WAT ER OPENSTOND, GEMETEN EN NIET GEGOKT
-- Met de rol van een anonieme bezoeker aangenomen gaven ze dit prijs:
--   site_sessies                      103 rijen
--   site_dag, site_dag_pad, ...       alles
--   price_test_devices (view)           6 rijen
--   price_test_device_dekking (view)    1 rij
-- Na de wijziging: niets zichtbaar, en schrijven geblokkeerd.
--
-- WAAROM DIT NIETS BREEKT
-- Alle drie de apps praten met de service-role sleutel, en die omzeilt RLS
-- volledig. Het bewijs stond er al voordat ik iets deed: bundle_events en
-- popup_events hebben RLS aan zonder één beleidsregel, en die tabellen
-- groeien gewoon door. In dezelfde meting gaven ze aan anon niets prijs.
--
-- Geen beleidsregels dus, en dat is opzet. Een beleidsregel is een deur; wat
-- hier nodig is, is een muur. De advisor meldt daarom "RLS enabled, no policy"
-- als INFO - dat is de gewenste toestand, geen openstaand punt.
alter table site_sessies  enable row level security;
alter table site_dag      enable row level security;
alter table site_dag_pad  enable row level security;
alter table site_dag_bron enable row level security;
alter table site_dag_geo  enable row level security;
alter table site_dag_tech enable row level security;

-- VIEWS ZIJN HET GAT DAT DE ADVISOR NIET NOEMT
-- Een view zonder security_invoker draait als zijn eigenaar, en die slaat RLS
-- over. De onderliggende tabel kan dan keurig dichtstaan terwijl de view alles
-- alsnog doorgeeft. Deze twee maakte ik vandaag en stonden zo.
alter view price_test_devices        set (security_invoker = true);
alter view price_test_device_dekking set (security_invoker = true);

-- DUBBELE FUNCTIE WEG
-- De oude twaalf-argument site_pageview stond naast de nieuwe met browser, os,
-- taal en scherm. Omdat die vier een default hebben was een aanroep met twaalf
-- argumenten dubbelzinnig - exact wat site_opruimen deed stuklopen.
drop function if exists site_pageview(
  text, text, text, text, text, text, text, text, text, text, boolean, timestamptz
);

-- search_path vastgezet, zodat een functie zijn tabellen niet oplost via het
-- pad van wie hem aanroept.
alter function site_pageview(text, text, text, text, text, text, text, text, text, text,
                             boolean, timestamptz, text, text, text, text)
  set search_path = public, pg_temp;
alter function site_vertrek(text, integer, integer, text, timestamptz) set search_path = public, pg_temp;
alter function site_order(text, bigint)                                set search_path = public, pg_temp;
alter function site_oprollen(date)                                     set search_path = public, pg_temp;
alter function site_opruimen()                                         set search_path = public, pg_temp;
