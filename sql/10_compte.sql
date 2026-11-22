-- ROUTA (10) : rattacher un profil à un compte Google / Apple (connexion pas encore activée).
-- Sans effet tant que la connexion n'est pas allumée dans l'app (config.js › loginProviders).
alter table public.drivers add column if not exists auth_uid uuid;
create unique index if not exists drivers_auth_uid_key on public.drivers (auth_uid) where auth_uid is not null;

-- Rattacher la fiche de CET appareil au compte connecté (preuve : le secret de l'appareil)
create or replace function public.routa_link(did text, s text) returns boolean
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); d public.drivers;
begin
  if u is null or did is null or s is null or length(s) < 24 then return false; end if;
  select * into d from public.drivers where id = did for update;
  if not found or (d.secret is not null and d.secret <> s) then return false; end if;
  -- un compte = une fiche : on détache une éventuelle ancienne fiche de ce compte
  update public.drivers set auth_uid = null where auth_uid = u and id <> did;
  update public.drivers set auth_uid = u where id = did;
  return true;
end $$;

-- Retrouver sa fiche sur un nouveau téléphone (seulement pour le compte connecté)
create or replace function public.routa_restore() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); d public.drivers;
begin
  if u is null then return null; end if;
  select * into d from public.drivers where auth_uid = u limit 1;
  if not found then return null; end if;
  return jsonb_build_object('id', d.id, 'secret', d.secret, 'pseudo', d.pseudo, 'code', d.code, 'color', d.color, 'car', d.car, 'visibility', d.visibility, 'points', d.points);
end $$;

revoke all on function public.routa_link(text, text) from public, anon;
revoke all on function public.routa_restore() from public, anon;
grant execute on function public.routa_link(text, text) to authenticated;
grant execute on function public.routa_restore() to authenticated;
