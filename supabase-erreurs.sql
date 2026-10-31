-- =============================================================
--  SynApps — remontée des erreurs JavaScript (commune à toutes les apps)
--  À exécuter d'abord dans Synapps_test, puis dans Synapps_public.
--  SQL Editor > New query > coller > Run. Peut être relancé sans risque.
--
--  Chaque page envoie ici les erreurs JavaScript rencontrées par les
--  visiteurs (sans e-mail ni donnée personnelle). Personne ne peut les
--  relire depuis une app : seuls le tableau de bord Supabase et le robot
--  de surveillance GitHub (clé secrète rangée dans les secrets GitHub)
--  y ont accès. Le robot efface les erreurs de plus de 90 jours.
--  Le Security Advisor de Supabase signalera la règle d'ajout ouverte à
--  tous (« always true ») : c'est voulu, les visiteurs sans compte
--  doivent pouvoir signaler leurs erreurs.
-- =============================================================

create table if not exists public.erreurs (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  app        text not null check (char_length(app) <= 40),
  page       text check (char_length(page) <= 200),
  message    text not null check (char_length(message) <= 500),
  source     text check (char_length(source) <= 300),
  ligne      int,
  colonne    int,
  pile       text check (char_length(pile) <= 2000),
  navigateur text check (char_length(navigateur) <= 300)
);
create index if not exists erreurs_date on public.erreurs(created_at);

alter table public.erreurs enable row level security;

-- Droits : les visiteurs ne peuvent qu'AJOUTER, et seulement ces colonnes
-- (pas created_at : la date est toujours celle du serveur).
revoke all on public.erreurs from anon, authenticated;
grant insert (app, page, message, source, ligne, colonne, pile, navigateur)
  on public.erreurs to anon, authenticated;
grant select, delete on public.erreurs to service_role;   -- robot de surveillance

drop policy if exists "erreurs_ajouter" on public.erreurs;
create policy "erreurs_ajouter" on public.erreurs
  for insert to anon, authenticated with check (true);
-- aucune règle de lecture, de modification ni de suppression

-- Anti-abus : date imposée par le serveur, au plus 200 erreurs par heure
-- et 1000 par jour. Au-delà, l'erreur est ignorée sans message d'erreur.
-- (security definer : sinon le comptage, fait avec les droits du visiteur
-- qui n'a pas le droit de lire, trouverait toujours 0.)
create or replace function public.erreurs_filtrer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_at := now();
  if (select count(*) from public.erreurs where created_at > now() - interval '1 hour') >= 200
     or (select count(*) from public.erreurs where created_at > now() - interval '1 day') >= 1000 then
    return null;
  end if;
  return new;
end $$;
revoke execute on function public.erreurs_filtrer() from public, anon, authenticated;

drop trigger if exists erreurs_filtrer on public.erreurs;
create trigger erreurs_filtrer before insert on public.erreurs
  for each row execute function public.erreurs_filtrer();
