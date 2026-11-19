-- =====================================================================
-- Réglages généraux de l'application (indépendants d'un championnat),
-- modifiables à tout moment par l'administrateur.
-- Ex. : lien d'invitation du groupe WhatsApp de la classe.
-- =====================================================================
create table public.app_settings (
  key        text primary key check (key in ('whatsapp_group_url')),
  value      text,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
create policy "lecture" on public.app_settings for select to authenticated using (true);
revoke all on public.app_settings from anon;
revoke insert, update, delete, truncate on public.app_settings from authenticated;

create or replace function public.set_app_setting(p_key text, p_value text)
returns void language plpgsql security definer set search_path = '' as $$
declare v text := nullif(trim(coalesce(p_value, '')), '');
begin
  perform public.assert_admin();
  if p_key = 'whatsapp_group_url' and v is not null and v !~ '^https://chat\.whatsapp\.com/[A-Za-z0-9]{10,40}$' then
    raise exception 'Lien de groupe WhatsApp invalide (attendu : https://chat.whatsapp.com/...)';
  end if;
  insert into public.app_settings (key, value, updated_by, updated_at)
  values (p_key, v, auth.uid(), now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
end $$;

revoke execute on function public.set_app_setting(text, text) from public, anon;
grant execute on function public.set_app_setting(text, text) to authenticated;
