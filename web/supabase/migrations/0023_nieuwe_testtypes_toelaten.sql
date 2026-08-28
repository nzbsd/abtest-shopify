-- De twee checks die de nieuwe testtypes tegenhielden.
--
-- WAT ER MISGING
-- price_tests_test_type_check stamt uit de tijd dat er vier types waren en
-- noemde ze alle vier bij naam. price_tests_type_compleet bewaakt per type dat
-- de bijbehorende kolommen gevuld zijn, en eindigt op ELSE false - een type dat
-- er niet in staat wordt dus hoe dan ook geweigerd.
--
-- Daardoor kon geen enkele afbeeldings- of kassatest opgeslagen worden. En het
-- ergste eraan: je zag het niet. De wizard sloot op het moment van versturen en
-- keek nooit naar het antwoord, dus het scherm ging dicht, de lijst bleef leeg,
-- en het enige dat je merkte was dat je test weg was.
--
-- Die ELSE false blijft staan, en met opzet. Hij is precies de reden dat dit
-- een harde weigering was in plaats van een halve rij: een nieuw type dat
-- vergeten wordt toe te voegen faalt luid bij de eerste poging, niet stil bij
-- de eerste order.
alter table public.price_tests drop constraint if exists price_tests_test_type_check;

alter table public.price_tests
  add constraint price_tests_test_type_check
  check (test_type in ('price', 'image', 'template', 'url', 'checkout', 'theme'));

alter table public.price_tests drop constraint if exists price_tests_type_compleet;

alter table public.price_tests
  add constraint price_tests_type_compleet check (
    case test_type
      when 'price'    then control_product_id is not null and test_product_id is not null
                           and test_product_handle is not null
      -- Een positie zonder product wijst nergens heen, en een product zonder
      -- positie laat de galerij staan: beide groepen zien dan hetzelfde.
      when 'image'    then control_product_id is not null and image_positie is not null
      when 'template' then control_product_id is not null and template_suffix is not null
      when 'url'      then control_url is not null and test_url is not null and control_url <> test_url
      -- Geen product en geen pad: een kassatest hangt aan de hele winkel.
      when 'checkout' then checkout_variant is not null and checkout_config is not null
      when 'theme'    then test_theme_id is not null
      else false
    end
  );
