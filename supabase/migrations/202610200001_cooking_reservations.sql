-- A household lock serializes reservations with existing stock and membership writes.
create table public.cooking_sessions (
 id uuid primary key,
 household_id uuid not null references public.households on delete cascade,
 user_id uuid not null unique references auth.users on delete cascade,
 recipe jsonb not null,
 meal_data jsonb not null,
 expires_at timestamptz not null default (clock_timestamp()+interval '2 hours')
);
create table public.ingredient_reservations (
 session_id uuid not null references public.cooking_sessions on delete cascade,
 item_id uuid not null references public.inventory on delete cascade,
 amount numeric(12,2) not null check(amount>0 and amount<=1000000),
 primary key(session_id,item_id)
);
create index ingredient_reservations_item on public.ingredient_reservations(item_id);
alter table public.cooking_sessions enable row level security;
alter table public.ingredient_reservations enable row level security;
revoke all on public.cooking_sessions,public.ingredient_reservations from public,anon,authenticated;
grant all on public.cooking_sessions,public.ingredient_reservations to service_role;

create function public.cooking_state() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
   'session',(select to_jsonb(s) from public.cooking_sessions s
     where s.user_id=auth.uid() and s.household_id=private.household() and s.expires_at>statement_timestamp()),
   'reservations',coalesce((select jsonb_agg(jsonb_build_object(
     'sessionId',s.id,'userId',s.user_id,'itemId',r.item_id,'amount',r.amount,'expiresAt',s.expires_at))
     from public.ingredient_reservations r join public.cooking_sessions s on s.id=r.session_id
     where s.household_id=private.household() and s.expires_at>statement_timestamp()),'[]'::jsonb))
$$;
revoke all on function public.cooking_state() from public,anon;
grant execute on function public.cooking_state() to authenticated;

create function public.start_cooking(actor uuid,household uuid,session_id uuid,recipe_data jsonb,meal_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare existing public.cooking_sessions; entry jsonb; item public.inventory; held numeric; amount numeric;
begin
 perform 1 from public.households where id=household for update;
 if not found or not exists(select 1 from public.memberships where user_id=actor and household_id=household) then
   raise sqlstate '42501' using message='Household access is no longer available.';
 end if;
 delete from public.cooking_sessions where household_id=household and expires_at<=clock_timestamp();
 if session_id is null then raise exception 'Invalid cooking session.'; end if;
 if exists(select 1 from public.outcomes where id=session_id) then
   raise sqlstate 'PT409' using message='This cooking session was already recorded. Request fresh suggestions.';
 end if;
 select * into existing from public.cooking_sessions where id=session_id or user_id=actor;
 if found then
   if existing.id=session_id and existing.user_id=actor and existing.household_id=household and existing.recipe=recipe_data then
     return to_jsonb(existing);
   end if;
   raise sqlstate 'PT409' using message='You already have a cooking session. Resume it or end it first.';
 end if;
 if jsonb_typeof(recipe_data->'ingredients') is distinct from 'array'
   or jsonb_typeof(recipe_data->'name') is distinct from 'string'
   or length(trim(recipe_data->>'name')) not between 1 and 100 then raise exception 'Invalid recipe.'; end if;
 if jsonb_array_length(recipe_data->'ingredients') not between 1 and 50
   or (select count(distinct x->>'ingredientId') from jsonb_array_elements(recipe_data->'ingredients') x)<>jsonb_array_length(recipe_data->'ingredients')
   or not exists(select 1 from jsonb_array_elements(recipe_data->'ingredients') x where x->>'ingredientId' not like 'staple-%') then
   raise exception 'Review every tracked recipe ingredient exactly once.';
 end if;
 insert into public.cooking_sessions(id,household_id,user_id,recipe,meal_data)
   values(session_id,household,actor,recipe_data,start_cooking.meal_data) returning * into existing;
 for entry in select * from jsonb_array_elements(recipe_data->'ingredients') order by value->>'ingredientId' loop
   amount:=private.exact_amount(entry->'amount',true);
   if entry->>'ingredientId' like 'staple-%' then continue; end if;
   select * into item from public.inventory where id=(entry->>'ingredientId')::uuid and household_id=household for update;
   if not found or item.deleted or item.quantity is null or item.unit is distinct from entry->>'unit'
     or item.expiry_date<(clock_timestamp() at time zone 'Asia/Singapore')::date then
     raise sqlstate 'PT409' using message='A recipe ingredient is unavailable. Refresh your stock and request fresh suggestions.';
   end if;
   select coalesce(sum(r.amount),0) into held from public.ingredient_reservations r
     join public.cooking_sessions s on s.id=r.session_id where r.item_id=item.id and s.expires_at>clock_timestamp();
   if amount>item.quantity-held then
     raise sqlstate 'PT409' using message='Some portions are already reserved or no longer available. Refresh and choose another meal.';
   end if;
   insert into public.ingredient_reservations values(session_id,item.id,amount);
 end loop;
 return to_jsonb(existing);
end $$;

create function public.manage_cooking(actor uuid,household uuid,session_id uuid,action text)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.households where id=household for update;
 if not found or not exists(select 1 from public.memberships where user_id=actor and household_id=household) then
   raise sqlstate '42501' using message='Household access is no longer available.';
 end if;
 if action='cancel' then
   delete from public.cooking_sessions where id=session_id and user_id=actor and household_id=household;
 elsif action='renew' then
   update public.cooking_sessions set expires_at=clock_timestamp()+interval '2 hours'
     where id=session_id and user_id=actor and household_id=household and expires_at>clock_timestamp();
   if not found then raise sqlstate 'PT409' using message='Your reservation ended or expired. Reserve the portions again before cooking.'; end if;
 else raise exception 'Unknown cooking action.';
 end if;
end $$;

-- Guard every stock write, including edit, discard, undo and legacy confirmations.
create function private.protect_reserved_stock() returns trigger
language plpgsql security definer set search_path='' as $$
declare held numeric;
begin
 perform 1 from public.households where id=old.household_id for update;
 if not found then return old; end if; -- Allow cascading household deletion.
 select coalesce(sum(r.amount),0) into held from public.ingredient_reservations r
   join public.cooking_sessions s on s.id=r.session_id where r.item_id=old.id and s.expires_at>clock_timestamp();
 if held>0 then
   if tg_op='DELETE' then raise sqlstate 'PT409' using message='This ingredient has reserved portions. End the cooking session before deleting it.'; end if;
   if new.deleted or new.quantity is null or new.quantity<held or new.unit is distinct from old.unit
     or new.name is distinct from old.name or new.household_id is distinct from old.household_id then
     raise sqlstate 'PT409' using message='This change affects reserved portions. Keep the reserved amount or end the cooking session first.';
   end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger protect_reserved_stock before update or delete on public.inventory
for each row execute function private.protect_reserved_stock();

create function private.release_member_cooking() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 delete from public.cooking_sessions where user_id=old.user_id and household_id=old.household_id;
 return old;
end $$;
create trigger release_member_cooking after delete on public.memberships
for each row execute function private.release_member_cooking();

-- Keep the previous service-only entry point compatible during app rollout.
alter function public.confirm_meal(uuid,uuid,uuid,jsonb,jsonb) set schema private;
alter function private.confirm_meal(uuid,uuid,uuid,jsonb,jsonb) rename to confirm_meal_quantities;
revoke all on function private.confirm_meal_quantities(uuid,uuid,uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
create function public.confirm_meal(actor uuid,household uuid,session_id uuid,recipe_data jsonb,changes jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.households where id=household for update;
 -- Release the caller's own hold inside the same transaction as consumption.
 delete from public.cooking_sessions where id=session_id and user_id=actor and household_id=household and recipe=recipe_data;
 return private.confirm_meal_quantities(actor,household,session_id,recipe_data,changes);
end $$;
create function public.confirm_reserved_meal(actor uuid,household uuid,session_id uuid,recipe_data jsonb,changes jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.households where id=household for update;
 if not exists(select 1 from public.outcomes where id=session_id and actor_id=actor and household_id=household and recipe=recipe_data)
   and not exists(select 1 from public.cooking_sessions where id=session_id and user_id=actor
     and household_id=household and recipe=recipe_data and expires_at>clock_timestamp()) then
   raise sqlstate 'PT409' using message='Your reservation ended or expired. Reserve the portions again before confirming.';
 end if;
 return public.confirm_meal(actor,household,session_id,recipe_data,changes);
end $$;

alter function public.reset_demo(uuid,uuid,int,jsonb,jsonb,jsonb) set schema private;
alter function private.reset_demo(uuid,uuid,int,jsonb,jsonb,jsonb) rename to reset_demo_before_reservations;
revoke all on function private.reset_demo_before_reservations(uuid,uuid,int,jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;
create function public.reset_demo(actor uuid,household uuid,expected_version int,items_data jsonb,outcomes_data jsonb,events_data jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.households where id=household for update;
 delete from public.cooking_sessions where household_id=household;
 perform private.reset_demo_before_reservations(actor,household,expected_version,items_data,outcomes_data,events_data);
end $$;

revoke all on function private.protect_reserved_stock(),private.release_member_cooking() from public,anon,authenticated;
revoke all on function public.start_cooking(uuid,uuid,uuid,jsonb,jsonb),public.manage_cooking(uuid,uuid,uuid,text),
 public.confirm_meal(uuid,uuid,uuid,jsonb,jsonb),public.confirm_reserved_meal(uuid,uuid,uuid,jsonb,jsonb),
 public.reset_demo(uuid,uuid,int,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.start_cooking(uuid,uuid,uuid,jsonb,jsonb),public.manage_cooking(uuid,uuid,uuid,text),
 public.confirm_meal(uuid,uuid,uuid,jsonb,jsonb),public.confirm_reserved_meal(uuid,uuid,uuid,jsonb,jsonb),
 public.reset_demo(uuid,uuid,int,jsonb,jsonb,jsonb) to service_role;
