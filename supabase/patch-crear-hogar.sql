-- Pegar en SQL Editor si ya corriste schema.sql antes.
-- Crea el hogar aunque las reglas de lectura bloqueen el INSERT...RETURNING.

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

drop policy if exists households_select on public.households;
create policy households_select on public.households
  for select to authenticated
  using (public.is_member(id) or created_by = auth.uid());

grant execute on function public.create_household(text) to authenticated;
