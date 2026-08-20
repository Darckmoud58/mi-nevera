-- SQL Editor → Run. Arregla el invitar (sin pgcrypto) y recarga la API.

create extension if not exists pgcrypto;

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

grant execute on function public.create_invite(uuid, text) to authenticated;
grant execute on function public.accept_invite(text) to authenticated;
grant execute on function public.member_role(uuid) to authenticated;

notify pgrst, 'reload schema';
