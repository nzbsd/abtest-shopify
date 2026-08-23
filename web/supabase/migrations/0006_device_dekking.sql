-- Device meten ging in eerste instantie mis, en de uitsplitsing liet dat niet zien.
--
-- TWEE DINGEN GINGEN FOUT
--
-- 1. Het snippet las window.innerWidth, maar het draait bovenin de head - in
--    dit thema vóór <meta name="viewport">. Zolang die tag niet verwerkt is
--    geeft een telefoon de standaard layout-viewport terug, rond 980px, en dat
--    valt in het tablet-bereik. Resultaat na een half uur live: 293 "tablets"
--    tegen 4 "mobiel" op een winkel die vooral mobiel is. Opgelost in het
--    snippet door screen.width te gebruiken, dat niet van die tag afhangt.
--    De verkeerd gelabelde rijen zijn op null gezet: verkeerd is erger dan leeg.
--
-- 2. Events van vóór de meting hadden helemaal geen device, en verschenen als
--    één rij "unknown" met 3.500 bezoekers naast rijen met tientallen. Dat
--    leest als "de meesten gebruiken iets onbekends" terwijl het betekent
--    "dit is van voordat we het gingen meten".

create or replace view price_test_devices as
  select shop, test_id, cohort, device,
         count(*) filter (where event_type = 'view')     as views,
         count(*) filter (where event_type = 'atc')      as add_to_carts,
         count(*) filter (where event_type = 'purchase') as orders,
         coalesce(sum(revenue_cents) filter (where event_type = 'purchase'), 0) as revenue_cents,
         coalesce(sum(revenue_cents::numeric * revenue_cents::numeric)
                    filter (where event_type = 'purchase'), 0) as revenue_sq_cents,
         count(distinct visitor_id) filter (where event_type = 'view') as visitors
  from price_test_events
  where device is not null and device <> 'unknown'
  group by shop, test_id, cohort, device;

-- Hoeveel verkeer buiten de uitsplitsing valt, zodat het scherm dat benoemt
-- in plaats van stil een deel weg te laten.
create or replace view price_test_device_dekking as
  select shop, test_id,
         count(distinct visitor_id) filter (
           where event_type = 'view' and (device is null or device = 'unknown')
         ) as zonder_device,
         count(distinct visitor_id) filter (
           where event_type = 'view' and device is not null and device <> 'unknown'
         ) as met_device
  from price_test_events
  group by shop, test_id;
