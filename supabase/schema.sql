-- Mi Nevera — plan Free de Supabase
-- SQL Editor → New query → pegar todo → Run

create extension if not exists pgcrypto;

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Mi hogar',
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'adult' check (role in ('owner', 'adult', 'guest')),
  display_name text,
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  token text not null unique,
  role text not null default 'adult' check (role in ('adult', 'guest')),
  invited_by uuid not null references auth.users (id),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.inventories (
  household_id uuid primary key references public.households (id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

create index if not exists household_members_user_idx on public.household_members (user_id);
create index if not exists invites_token_idx on public.invites (token);

create or replace function public.is_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = hid and user_id = auth.uid()
  );
$$;

create or replace function public.member_role(hid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.household_members
  where household_id = hid and user_id = auth.uid()
  limit 1;
$$;

create or replace function public.on_household_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  label text;
begin
  select split_part(email, '@', 1) into label from auth.users where id = new.created_by;
  insert into public.household_members (household_id, user_id, role, display_name)
  values (new.id, new.created_by, 'owner', coalesce(label, 'Dueño'));
  insert into public.inventories (household_id, items) values (new.id, '[]'::jsonb);
  return new;
end;
$$;

drop trigger if exists trg_household_created on public.households;
create trigger trg_household_created
after insert on public.households
for each row execute procedure public.on_household_created();

create or replace function public.create_invite(p_household_id uuid, p_role text default 'adult')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r text;
  tok text;
begin
  r := public.member_role(p_household_id);
  if r is null or r = 'guest' then
    raise exception 'No puedes invitar a este hogar';
  end if;
  if p_role not in ('adult', 'guest') then
    p_role := 'adult';
  end if;
  tok := md5(random()::text || clock_timestamp()::text || p_household_id::text || auth.uid()::text);
  insert into public.invites (household_id, token, role, invited_by)
  values (p_household_id, tok, p_role, auth.uid());
  return tok;
end;
$$;

create or replace function public.accept_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invites%rowtype;
  label text;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión';
  end if;
  select * into inv
  from public.invites
  where token = p_token and accepted_at is null and expires_at > now();
  if not found then
    raise exception 'Invitación inválida o caducada';
  end if;
  if exists (
    select 1 from public.household_members
    where household_id = inv.household_id and user_id = auth.uid()
  ) then
    return inv.household_id;
  end if;
  select split_part(email, '@', 1) into label from auth.users where id = auth.uid();
  insert into public.household_members (household_id, user_id, role, display_name)
  values (inv.household_id, auth.uid(), inv.role, coalesce(label, 'Familiar'));
  update public.invites set accepted_at = now() where id = inv.id;
  return inv.household_id;
end;
$$;

create or replace function public.create_household(p_name text default 'Mi hogar')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hid uuid;
begin
  if auth.uid() is null then
    raise exception 'Inicia sesión';
  end if;
  insert into public.households (name, created_by)
  values (coalesce(nullif(trim(p_name), ''), 'Mi hogar'), auth.uid())
  returning id into hid;
  return hid;
end;
$$;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.invites enable row level security;
alter table public.inventories enable row level security;

drop policy if exists households_select on public.households;
drop policy if exists households_insert on public.households;
drop policy if exists households_update on public.households;
drop policy if exists members_select on public.household_members;
drop policy if exists members_delete_self on public.household_members;
drop policy if exists invites_select on public.invites;
drop policy if exists inventories_select on public.inventories;
drop policy if exists inventories_update on public.inventories;

create policy households_select on public.households
  for select to authenticated
  using (public.is_member(id) or created_by = auth.uid());

create policy households_insert on public.households
  for insert to authenticated
  with check (created_by = auth.uid());

create policy households_update on public.households
  for update to authenticated
  using (public.member_role(id) = 'owner')
  with check (public.member_role(id) = 'owner');

create policy members_select on public.household_members
  for select to authenticated
  using (public.is_member(household_id));

create policy members_delete_self on public.household_members
  for delete to authenticated
  using (user_id = auth.uid() and public.member_role(household_id) <> 'owner');

create policy invites_select on public.invites
  for select to authenticated
  using (public.is_member(household_id));

create policy inventories_select on public.inventories
  for select to authenticated
  using (public.is_member(household_id));

create policy inventories_update on public.inventories
  for update to authenticated
  using (public.member_role(household_id) in ('owner', 'adult'))
  with check (public.member_role(household_id) in ('owner', 'adult'));

grant usage on schema public to authenticated;
grant select, insert, update on public.households to authenticated;
grant select, delete on public.household_members to authenticated;
grant select on public.invites to authenticated;
grant select, update on public.inventories to authenticated;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.member_role(uuid) to authenticated;
grant execute on function public.create_invite(uuid, text) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.create_household(text) to authenticated;
