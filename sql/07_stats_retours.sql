-- ROUTA : statistiques privées pour Ackfix (uniquement des totaux, aucune donnée personnelle)
create extension if not exists pgcrypto with schema extensions;
create or replace function public.routa_stats(k text) returns jsonb
language plpgsql security definer set search_path = public, extensions stable as $$
declare r jsonb;
begin
  if k is null or encode(extensions.digest(k, 'sha256'), 'hex') <> '4f7bb2ff4e320424b4a1ee14948b388a351a7afc3db2f88a75a7402892d3d7a0' then return null; end if;
  select jsonb_build_object(
    'profils', (select count(*) from public.drivers),
    'actifs_24h', (select count(*) from public.drivers where updated_at > now() - interval '24 hours'),
    'actifs_7j', (select count(*) from public.drivers where updated_at > now() - interval '7 days'),
    'actifs_30j', (select count(*) from public.drivers where updated_at > now() - interval '30 days'),
    'par_jour', (select coalesce(jsonb_agg(jsonb_build_object('j', j, 'n', n) order by j), '[]'::jsonb) from (
       select to_char(date_trunc('day', updated_at at time zone 'Europe/Zurich'), 'YYYY-MM-DD') j, count(*) n
       from public.drivers where updated_at > now() - interval '14 days' group by 1) x),
    'zones', (select coalesce(jsonb_agg(jsonb_build_object('lat', la, 'lon', lo, 'n', n) order by n desc), '[]'::jsonb) from (
       select round(lat::numeric, 1) la, round(lon::numeric, 1) lo, count(*) n
       from public.drivers where lat is not null and updated_at > now() - interval '30 days' group by 1, 2 order by 3 desc limit 60) z),
    'spots', (select count(*) from public.spots),
    'spots_membres', (select count(*) from public.spots where created_name is distinct from 'ROUTA'),
    'alertes_7j', (select count(*) from public.alerts where created_at > now() - interval '7 days'),
    'convois', (select count(*) from public.convoys),
    'messages_7j', (select count(*) from public.messages where created_at > now() - interval '7 days'),
    'retours', (select count(*) from public.feedback)
  ) into r;
  return r;
end $$;
revoke all on function public.routa_stats(text) from public;
grant execute on function public.routa_stats(text) to anon, authenticated;

-- Retours des testeurs (lecture protégée par le même code)
create or replace function public.routa_retours(k text, lim int default 300) returns jsonb
language plpgsql security definer set search_path = public, extensions stable as $$
begin
  if k is null or encode(extensions.digest(k, 'sha256'), 'hex') <> '4f7bb2ff4e320424b4a1ee14948b388a351a7afc3db2f88a75a7402892d3d7a0' then return null; end if;
  return (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) from (
    select kind, message, pseudo, app_version, device, page, created_at from public.feedback order by created_at desc limit least(coalesce(lim, 300), 1000)) x);
end $$;
revoke all on function public.routa_retours(text, int) from public;
grant execute on function public.routa_retours(text, int) to anon, authenticated;
