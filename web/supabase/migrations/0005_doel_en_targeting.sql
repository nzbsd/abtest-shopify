-- Waar de test op besloten wordt, en wie hem te zien krijgt.
--
-- Tot nu toe besliste de app dat zelf: omzet per bezoeker, 95% betrouwbaarheid,
-- iedereen doet mee. Dat is een prima standaard maar een slechte aanname. Een
-- test op de knopkleur gaat over conversie, niet over omzet per bezoeker; een
-- prijstest mag conversie best kosten. En wie iets alleen op mobiel verandert,
-- moet niet op desktopverkeer wachten om het te weten.

alter table price_tests
  -- Waarop de uitslag wordt gelezen. Zie lib/metrics.ts voor wat elke sleutel
  -- betekent en met welke toets hij gemeten wordt.
  add column if not exists primary_metric text not null default 'rpv',
  -- Metrieken die niet mogen verslechteren, ook al wint de hoofdmetriek. Bij
  -- een prijstest is het abonnementsaandeel de klassieke: meer omzet vandaag
  -- is een slechte ruil tegen minder abonnees.
  add column if not exists guardrails text[] not null default '{}',
  add column if not exists confidence_pct integer not null default 95,
  -- Het kleinste verschil dat de moeite waard is om te vinden, in procenten.
  -- Bepaalt hoeveel bezoekers de test nodig heeft; zonder dit getal kun je
  -- alleen achteraf zien of je genoeg had.
  add column if not exists mde_pct numeric,
  -- Leeg betekent iedereen. Bewust geen aparte "alles"-waarde: een lege lijst
  -- is al de natuurlijke manier om "geen beperking" te zeggen.
  add column if not exists target_devices text[] not null default '{}',
  add column if not exists target_countries text[] not null default '{}',
  -- Wat je uiteindelijk besloot. Een gestopte test zonder besluit is over een
  -- half jaar niet meer waard dan "daar hebben we ooit iets mee gedaan".
  add column if not exists besluit text,
  add column if not exists besluit_notitie text,
  add column if not exists besluit_at timestamptz;

do $$ begin
  alter table price_tests add constraint price_tests_primary_metric_check
    check (primary_metric in ('rpv', 'cvr', 'aov', 'sub_rate', 'atc'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table price_tests add constraint price_tests_confidence_check
    check (confidence_pct in (90, 95, 99));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table price_tests add constraint price_tests_besluit_check
    check (besluit is null or besluit in ('uitrollen', 'verwerpen', 'onbeslist', 'opnieuw'));
exception when duplicate_object then null; end $$;

-- Device op het event, zodat de uitslag uitgesplitst kan worden. Een variant
-- die op desktop wint en op mobiel verliest is geen winnaar; zonder deze kolom
-- is dat verschil onzichtbaar en rol je hem overal uit.
alter table price_test_events
  add column if not exists device text;

create index if not exists price_test_events_device_idx
  on price_test_events (test_id, cohort, device)
  where event_type = 'view';

-- Uitsplitsing per device. Apart van price_test_stats gehouden: die groepeert
-- op markt, en er device bij groeperen zou elke bestaande rij opsplitsen en
-- alle huidige berekeningen stilzwijgend veranderen.
create or replace view price_test_devices as
  select shop,
         test_id,
         cohort,
         coalesce(device, 'unknown') as device,
         count(*) filter (where event_type = 'view')     as views,
         count(*) filter (where event_type = 'atc')      as add_to_carts,
         count(*) filter (where event_type = 'purchase') as orders,
         coalesce(sum(revenue_cents) filter (where event_type = 'purchase'), 0) as revenue_cents,
         coalesce(sum(revenue_cents::numeric * revenue_cents::numeric)
                    filter (where event_type = 'purchase'), 0) as revenue_sq_cents,
         count(distinct visitor_id) filter (where event_type = 'view') as visitors
  from price_test_events
  group by shop, test_id, cohort, coalesce(device, 'unknown');
