-- ROUTA (09) : statistiques par période (24 h, 7 j, 30 j, 90 j, tout). À lancer dans Supabase > SQL Editor.
create extension if not exists pgcrypto with schema extensions;
create or replace function public.routa_stats_p(k text, h int default 168) returns jsonb
language plpgsql security definer set search_path = public, extensions stable as $$
declare
  r jsonb;
  hh int := greatest(1, least(coalesce(h, 168), 200000));
  since timestamptz := now() - make_interval(hours => greatest(1, least(coalesce(h, 168), 200000)));
  stp text := case when coalesce(h, 168) <= 48 then 'hour' else 'day' end;
  s0 timestamptz;
  fmt text := case when coalesce(h, 168) <= 48 then 'HH24"h"' else 'YYYY-MM-DD' end;
begin
  if k is null or encode(extensions.digest(k, 'sha256'), 'hex') <> '4f7bb2ff4e320424b4a1ee14948b388a351a7afc3db2f88a75a7402892d3d7a0' then return null; end if;
  s0 := greatest(since, least(coalesce((select min(created_at) from public.alerts), now()), coalesce((select min(updated_at) from public.drivers), now())));
  select jsonb_build_object(
    'h', hh, 'step', stp,
    'profils', (select count(*) from public.drivers),
    'actifs', (select count(*) from public.drivers where updated_at > since),
    'alertes', (select count(*) from public.alerts where type <> 'lieu_ferme' and created_at > since),
    'alertes_types', (select coalesce(jsonb_agg(jsonb_build_object('t', type, 'n', n) order by n desc), '[]'::jsonb) from (
       select type, count(*) n from public.alerts where type <> 'lieu_ferme' and created_at > since group by 1) y),
    'avis', (select count(*) from public.feedback where created_at > since),
    'avis_total', (select count(*) from public.feedback),
    'messages', (select count(*) from public.messages where created_at > since),
    'spots', (select count(*) from public.spots),
    'spots_membres', (select count(*) from public.spots where created_name is distinct from 'ROUTA'),
    'convois', (select count(*) from public.convoys),
    'serie_alertes', (select coalesce(jsonb_agg(jsonb_build_object('t', to_char(g, fmt), 'n', coalesce(n, 0)) order by g), '[]'::jsonb) from
       generate_series(date_trunc(stp, s0 at time zone 'Europe/Zurich'), date_trunc(stp, now() at time zone 'Europe/Zurich'), ('1 ' || stp)::interval) g
       left join (select date_trunc(stp, created_at at time zone 'Europe/Zurich') b, count(*) n from public.alerts where type <> 'lieu_ferme' and created_at > since group by 1) a on a.b = g),
    'serie_actifs', (select coalesce(jsonb_agg(jsonb_build_object('t', to_char(g, fmt), 'n', coalesce(n, 0)) order by g), '[]'::jsonb) from
       generate_series(date_trunc(stp, s0 at time zone 'Europe/Zurich'), date_trunc(stp, now() at time zone 'Europe/Zurich'), ('1 ' || stp)::interval) g
       left join (select date_trunc(stp, updated_at at time zone 'Europe/Zurich') b, count(*) n from public.drivers where updated_at > since group by 1) a on a.b = g),
    'zones', (select coalesce(jsonb_agg(jsonb_build_object('lat', la, 'lon', lo, 'n', n) order by n desc), '[]'::jsonb) from (
       select round(lat::numeric, 1) la, round(lon::numeric, 1) lo, count(*) n
       from public.drivers where lat is not null and updated_at > since group by 1, 2 order by 3 desc limit 60) z)
  ) into r;
  return r;
end $$;
revoke all on function public.routa_stats_p(text, int) from public;
grant execute on function public.routa_stats_p(text, int) to anon, authenticated;
