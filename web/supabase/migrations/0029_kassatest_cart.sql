-- Kassatest "cart": de testgroep krijgt de cart in plaats van skip-cart
-- (Herbies Bundles). Toegepast op 25-11-2026.
alter table public.price_tests drop constraint price_tests_checkout_variant_check;
alter table public.price_tests add constraint price_tests_checkout_variant_check check (
  checkout_variant is null or checkout_variant = any (array[
    'banner', 'trust', 'faq', 'shipbar', 'upsell', 'verzending', 'gratisverzending', 'cart'
  ]::text[])
);
