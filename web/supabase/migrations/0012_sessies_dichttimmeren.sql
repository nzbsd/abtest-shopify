-- De sessietabel bevat het toegangstoken van de winkel. Vanaf deze wijziging
-- staat dat token versleuteld (zie app/lib/tokenKluis.server.ts), maar de
-- tabel zelf mag ook niets meer prijsgeven.
--
-- RLS stond al aan zonder policies, dus lezen lukte al niet. Het SELECT-recht
-- dat anon en authenticated van Supabase standaard meekrijgen stond er echter
-- nog. Dat recht doet nu niets, maar het is er wel: zodra iemand ooit een
-- policy op deze tabel zet - ook per ongeluk, ook een ruime - wordt het
-- meteen bruikbaar. Weghalen wat niemand nodig heeft.
--
-- De app zelf draait op de service-role-sleutel en die gaat langs zowel RLS
-- als deze rechten heen; die merkt hier niets van.
revoke all on table public.price_test_sessions from anon, authenticated;

