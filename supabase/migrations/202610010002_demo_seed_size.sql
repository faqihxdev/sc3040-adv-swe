-- Match the current 40-ingredient application seed. Preserve owner/version checks.
create or replace function public.reset_demo(actor uuid, household uuid, expected_version int, items_data jsonb, outcomes_data jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare h public.households;
begin
 select * into h from public.households where id=household for update;
 if not found or h.owner_id is distinct from actor
   or not exists(select 1 from public.memberships where user_id=actor and household_id=household) then
   raise sqlstate '42501' using message='Only the household owner can reset demo data.';
 end if;
 if h.version is distinct from expected_version then
   raise sqlstate 'PT409' using message='Your household changed. Refresh before resetting.';
 end if;
 if jsonb_typeof(items_data) is distinct from 'array' or jsonb_array_length(items_data)<>40
   or jsonb_typeof(outcomes_data) is distinct from 'array' or jsonb_array_length(outcomes_data)<>14 then
   raise exception 'Invalid demo seed.';
 end if;
 delete from private.inventory_imports where household_id=household;
 delete from public.activity where household_id=household;
 delete from public.outcomes where household_id=household;
 delete from public.inventory where household_id=household;
 insert into public.inventory(id,household_id,name,stock,expiry_date,category,location,updated_by)
 select id,household,name,stock,expiry_date,category,location,actor
 from jsonb_to_recordset(items_data) as x(id uuid,name text,stock smallint,expiry_date date,category text,location text);
 insert into public.outcomes(id,household_id,actor_id,recipe,ingredients,synthetic,created_at)
 select id,household,
   case when exists(select 1 from public.memberships where user_id=x.actor_id and household_id=household) then x.actor_id else actor end,
   recipe,ingredients,true,created_at
 from jsonb_to_recordset(outcomes_data) as x(id uuid,actor_id uuid,recipe jsonb,ingredients jsonb,created_at timestamptz);
 update public.households set version=version+1,
   locations=array(select distinct unnest(h.locations || array['Fridge','Pantry'])) where id=household;
 insert into public.activity(household_id,actor_id,action,label)
 values(household,actor,'demo_reset','Restored demo ingredients and meal history');
end $$;
revoke all on function public.reset_demo(uuid,uuid,int,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.reset_demo(uuid,uuid,int,jsonb,jsonb) to service_role;
