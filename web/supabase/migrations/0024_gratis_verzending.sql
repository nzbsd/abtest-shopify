-- Zevende kassamechaniek: gratis verzending voor de testgroep.
--
-- Waarom dit een eigen waarde is en geen instelling binnen 'verzending': het is
-- een ander functietype met een andere koppeling in Shopify. De verzendtest
-- hangt aan een delivery customization (Instellingen, Verzending, Aanpassingen);
-- gratis verzending is een korting en hangt aan een automatische app-korting
-- (Kortingen). Zelfde kolom checkout_customization_id, andere soort id erin -
-- vandaar dat het starten en stoppen moet weten welke van de twee het is.
alter table public.price_tests drop constraint if exists price_tests_checkout_variant_check;

alter table public.price_tests
  add constraint price_tests_checkout_variant_check
  check (checkout_variant is null or checkout_variant in
         ('banner', 'trust', 'faq', 'shipbar', 'upsell', 'verzending', 'gratisverzending'));
