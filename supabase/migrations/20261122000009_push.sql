-- =====================================================================
-- Chess IR — Notifications push (téléphone, même application fermée)
-- =====================================================================
-- Chaque notification créée dans l'application (défi, direct, résultat
-- à confirmer…) est aussi envoyée sur les appareils abonnés du joueur.
--
-- Chaîne : insertion dans `notifications` → déclencheur → appel HTTP
-- asynchrone (pg_net) vers l'Edge Function `push-send` → Web Push.
-- La fonction n'envoie qu'une fois chaque notification récente : l'appeler
-- n'a donc aucun effet indésirable, aucun secret n'est nécessaire.
--
-- Configuration (une fois par environnement, voir README) :
--   insert into private.push_config (function_url)
--   values ('https://<projet>.supabase.co/functions/v1/push-send');
-- =====================================================================

create extension if not exists pg_net with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.push_config (
  id           boolean primary key default true check (id),
  function_url text not null
);

-- ---------------------------------------------------------------------
-- Abonnements (un par appareil / navigateur)
-- ---------------------------------------------------------------------
create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index push_subscriptions_profile_idx on public.push_subscriptions (profile_id);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon;
revoke update, truncate on public.push_subscriptions from authenticated;
-- Chacun ne voit et ne gère que ses propres appareils.
create policy "mes appareils" on public.push_subscriptions for select to authenticated using (profile_id = auth.uid());
create policy "ajouter mon appareil" on public.push_subscriptions for insert to authenticated with check (profile_id = auth.uid());
create policy "retirer mon appareil" on public.push_subscriptions for delete to authenticated using (profile_id = auth.uid());

-- Un appareil passé à un autre compte (même navigateur) : on le rattache au nouveau compte.
create or replace function public.register_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Connexion requise' using errcode = '42501'; end if;
  if p_endpoint !~ '^https://' then raise exception 'Abonnement invalide'; end if;
  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set profile_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now();
end $$;

revoke all on function public.register_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Envoi : une notification créée → un appel à `push-send`
-- ---------------------------------------------------------------------
alter table public.notifications add column pushed_at timestamptz;

create or replace function public.push_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
begin
  select function_url into v_url from private.push_config;
  if v_url is null then return new; end if;
  if not exists (select 1 from public.push_subscriptions where profile_id = new.profile_id) then return new; end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('notification_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
  return new;
exception when others then
  -- L'envoi push ne doit jamais empêcher la création de la notification.
  return new;
end $$;

create trigger push_notification
  after insert on public.notifications
  for each row execute function public.push_notification();

revoke all on function public.push_notification() from public, anon, authenticated;
