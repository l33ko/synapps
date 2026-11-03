-- =============================================================
--  SynApps · Pixel arts — compteur des recherches « Invente un modèle »
--  À exécuter d'abord dans Synapps_test, puis dans Synapps_public.
--  SQL Editor > New query > coller > Run. Peut être relancé sans risque.
--
--  Sert uniquement aux plafonds de l'Edge Function « genere-pixel »
--  (nombre de recherches par jour, par appareil et au total), pour que
--  la clé Claude ne puisse pas être vidée. L'appareil est une empreinte
--  (hachage de l'adresse IP avec un sel secret qui change chaque jour) ;
--  le mot tapé est gardé aussi. Tout est effacé au bout de 2 jours.
--  Aucune app n'y a accès : seule la fonction (clé service_role) lit et
--  écrit, en passant par pixel_reserver.
-- =============================================================

create table if not exists public.pixel_generations (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  appareil   text not null check (char_length(appareil) <= 64),
  mot        text check (char_length(mot) <= 40)
);
create index if not exists pixel_generations_date on public.pixel_generations(created_at);
create index if not exists pixel_generations_appareil on public.pixel_generations(appareil, created_at);

alter table public.pixel_generations enable row level security;
revoke all on public.pixel_generations from anon, authenticated;
grant select, insert, delete on public.pixel_generations to service_role;
-- aucune règle (policy) : ni lecture ni écriture depuis les apps

-- Réserve une recherche avant d'appeler Claude : comptage et ajout dans la
-- même transaction, sous verrou, pour que des requêtes simultanées ne
-- puissent pas dépasser les plafonds. Plafond total absolu : 1000 par jour.
create or replace function public.pixel_reserver(p_appareil text, p_mot text, p_lim_appareil int, p_lim_total int)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare n_moi int; n_tous int;
begin
  perform pg_advisory_xact_lock(hashtext('pixel_generations'));
  delete from public.pixel_generations where created_at < now() - interval '2 days';
  select count(*) into n_tous from public.pixel_generations where created_at >= now() - interval '1 day';
  select count(*) into n_moi  from public.pixel_generations where appareil = p_appareil and created_at >= now() - interval '1 day';
  if n_moi >= p_lim_appareil or n_tous >= least(p_lim_total, 1000) then return false; end if;
  insert into public.pixel_generations(appareil, mot) values (left(p_appareil, 64), left(p_mot, 40));
  return true;
end $$;
revoke all on function public.pixel_reserver(text, text, int, int) from public, anon, authenticated;
grant execute on function public.pixel_reserver(text, text, int, int) to service_role;
