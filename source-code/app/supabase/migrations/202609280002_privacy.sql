-- Keep personal exclusions private; members receive only names and IDs.
drop policy profile_read on public.profiles;
create policy profile_read on public.profiles for select to authenticated using(id=auth.uid());
create function public.member_directory() returns table(id uuid,display_name text)
language sql stable security definer set search_path='' as $$
 select p.id,p.display_name from public.profiles p
 join public.memberships m on m.user_id=p.id
 where m.household_id=private.household()
 order by p.display_name
$$;
revoke all on function public.member_directory() from public,anon;
grant execute on function public.member_directory() to authenticated;
revoke all on function private.new_user() from public,anon,authenticated;
revoke all on function private.household() from public,anon;
grant execute on function private.household() to authenticated;

-- Historical row snapshots must not retain a deleted account's identifier.
create function private.deidentify_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.activity set before_state=before_state-'updated_by'
 where before_state->>'updated_by'=old.id::text;
 update public.activity set after_state=after_state-'updated_by'
 where after_state->>'updated_by'=old.id::text;
 return old;
end $$;
revoke all on function private.deidentify_user() from public,anon,authenticated;
create trigger deidentify_user before delete on auth.users
for each row execute function private.deidentify_user();
