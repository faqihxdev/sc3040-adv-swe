-- Administrative membership moves must release the member's old household portions too.
create trigger release_moved_member_cooking after update of household_id on public.memberships
for each row when (old.household_id is distinct from new.household_id)
execute function private.release_member_cooking();
