-- =============================================================
--  SynApps · Pixel arts — compteur des recherches « Invente un modèle »
--  À exécuter d'abord dans Synapps_test, puis dans Synapps_public.
--  SQL Editor > New query > coller > Run. Peut être relancé sans risque.
--
--  Sert uniquement aux plafonds de l'Edge Function « genere-pixel »
--  (nombre de recherches par jour, par appareil et au total), pour que
--  la clé Claude ne puisse pas être vidée. L'appareil est une empreinte
--  anonyme (hachage de l'adresse IP) ; les lignes sont effacées par la
--  fonction au bout de 2 jours. Aucune app n'y a accès : seule la
--  fonction (clé service_role) lit et écrit.
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
