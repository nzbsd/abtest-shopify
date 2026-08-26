-- Zie 0016, live toegepast op 2026-08-26.
--
-- Terugvalroute voor orders zonder sessie-kenmerk. _pt_sess kan ontbreken: de
-- winkelwagen kan vervangen zijn tussen het bezoek en de bestelling, of het
-- snippet kwam niet aan bod. Maar vaak staat _pt_visitor er wel in, en daarmee
-- is de sessie te herleiden.
--
-- Alleen binnen een halfuur. Verder terug wordt het gokken, en een order aan de
-- verkeerde sessie hangen is erger dan hem niet toekennen.
create or replace function site_order_via_bezoeker(
  p_shop text, p_order_id bigint, p_bezoeker text, p_cents bigint, p_besteld timestamptz
) returns boolean
language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare s_id text;
begin
  select s.session_id into s_id
  from site_sessies s
  where s.shop = p_shop and s.visitor_id = p_bezoeker
    and s.begonnen <= p_besteld
    and s.begonnen >  p_besteld - interval '30 minutes'
  order by s.begonnen desc
  limit 1;

  if s_id is null then return false; end if;
  return site_order_toekennen(p_shop, p_order_id, s_id, p_cents);
end $$;
