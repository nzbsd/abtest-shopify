-- price_test_events.product_id mag leeg zijn.
--
-- WAT ER MISGING
-- Die kolom stond op NOT NULL uit de tijd dat elke test aan een product hing.
-- Een kassatest hangt aan de hele winkel: geen control_product_id, geen
-- test_product_id, dus product_id werd null en de insert sloeg stuk.
--
-- En dat was niet te zien. De webhook vangt fouten op met een lege catch en
-- geeft altijd 200 terug - met opzet, want een niet-200 laat Shopify eindeloos
-- opnieuw proberen en dat levert alleen dubbele rijen op. Maar zonder log
-- betekende het hier: order geplaatst, cohort netjes op de order, en de rij
-- die daarbij hoort verdween zonder een spoor. Test 20 en 21 stonden dagen op
-- nul terwijl er gewoon toegewezen orders binnenkwamen.
--
-- Een lege waarde in plaats van null zou erger zijn: dan staat er in de
-- uitsplitsing per product een lege regel die er als een product uitziet.
-- Null zegt wat het is - deze test ging niet over een product.
alter table public.price_test_events
  alter column product_id drop not null;
