-- Existing band records require a measured amount; their quantity remains unknown.
alter table public.inventory add column quantity numeric(12,2), add column unit text;
alter table public.inventory alter column stock set default 0;
alter table public.inventory
 add constraint inventory_quantity_unit_pair check ((quantity is null) = (unit is null)),
 add constraint inventory_quantity_valid check (quantity is null or quantity between 0 and 1000000),
 add constraint inventory_unit_valid check (unit is null or unit in ('g','ml','piece'));

create table public.quantity_events (
 id uuid primary key default extensions.gen_random_uuid(),
 sequence bigint generated always as identity unique,
 household_id uuid not null references public.households on delete cascade,
 item_id uuid not null references public.inventory on delete cascade,
 activity_id bigint references public.activity on delete set null,
 name text not null, category text not null,
 unit text not null check(unit in ('g','ml','piece')),
 kind text not null check(kind in ('opening','restock','used','discarded','adjustment','undo')),
 amount numeric(12,2) not null check(amount between -1000000 and 1000000),
 before_quantity numeric(12,2) check(before_quantity between 0 and 1000000),
 quantity numeric(12,2) not null check(quantity between 0 and 1000000),
 created_at timestamptz not null default clock_timestamp(),
 synthetic boolean not null default false,
 voided boolean not null default false,
 discard_reason text check(discard_reason in ('spoiled','past_date','prep','other')),
 constraint quantity_event_balance check(
   (before_quantity is null and kind='opening' and amount=quantity)
   or (before_quantity is not null and before_quantity+amount=quantity)),
 constraint quantity_event_direction check(
   (kind in ('used','discarded') and amount<0) or
   (kind='restock' and amount>0) or kind in ('opening','adjustment','undo')),
 constraint quantity_event_waste_reason check(kind<>'discarded' or discard_reason is not null)
);
create index quantity_events_household_date on public.quantity_events(household_id,created_at desc,sequence desc);
alter table public.quantity_events enable row level security;
create policy quantity_events_read on public.quantity_events for select to authenticated using(household_id=private.household());
revoke all on public.quantity_events from anon,authenticated;
grant select on public.quantity_events to authenticated;

-- JSON validation precedes numeric(12,2) storage, which would otherwise round invalid precision.
create function private.exact_amount(value jsonb, positive boolean default false) returns numeric
language plpgsql immutable set search_path='' as $$
declare n numeric;
begin
 if jsonb_typeof(value) is distinct from 'number' or (value#>>'{}') !~ '^[0-9]+(\.[0-9]{1,2})?$' then
   raise exception 'Enter an amount with up to two decimal places.';
 end if;
 n:=(value#>>'{}')::numeric;
 if n>1000000 or n<0 or (positive and n=0) then raise exception 'Amount is outside the allowed range.'; end if;
 return n;
end $$;
revoke all on function private.exact_amount(jsonb,boolean) from public,anon,authenticated;

create function private.check_quantity_item(entry jsonb, positive boolean) returns void
language plpgsql immutable set search_path='' as $$
declare parsed_date date;
begin
 if jsonb_typeof(entry) is distinct from 'object'
   or jsonb_typeof(entry->'name') is distinct from 'string' or length(trim(entry->>'name')) not between 1 and 100
   or jsonb_typeof(entry->'unit') is distinct from 'string' or entry->>'unit' not in ('g','ml','piece')
   or jsonb_typeof(entry->'expiry_date') is distinct from 'string' or entry->>'expiry_date' !~ '^\d{4}-\d{2}-\d{2}$'
   or jsonb_typeof(entry->'category') is distinct from 'string' or length(entry->>'category')>50
   or jsonb_typeof(entry->'location') is distinct from 'string' or length(entry->>'location')>50 then
   raise exception 'Check the ingredient name, amount, unit and expiry date.';
 end if;
 perform private.exact_amount(entry->'quantity',positive);
 parsed_date:=(entry->>'expiry_date')::date;
 if to_char(parsed_date,'YYYY-MM-DD')<>entry->>'expiry_date' then raise exception 'Enter a valid expiry date.'; end if;
end $$;
revoke all on function private.check_quantity_item(jsonb,boolean) from public,anon,authenticated;

create or replace function public.mutate(command text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); hid uuid; h public.households; item public.inventory;
 previous jsonb; ev public.activity; activity_id bigint; snapshot jsonb;
 delta numeric; amount numeric; reason text; old_quantity numeric; old_unit text;
begin
 if command not in ('add_item','edit_item','adjust_item','remove_item','undo') then return private.mutate_single(command,payload); end if;
 if uid is null then raise sqlstate '42501' using message='Sign in to continue.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 hid:=private.household(); select * into h from public.households where id=hid for update;
 if not found or not exists(select 1 from public.memberships where user_id=uid and household_id=hid) then
   raise sqlstate '42501' using message='Household access is no longer available.';
 end if;
 if command='undo' then
   select * into ev from public.activity where household_id=hid and actor_id=uid
     and action in ('add_item','add_items','edit_item','adjust_item','remove_item','undo') order by id desc limit 1;
   if not found or ev.action='undo' then raise exception 'There is no inventory edit to undo.'; end if;
   if ev.action='add_items' then
     for snapshot in select * from jsonb_array_elements(ev.after_state->'items') loop
       select * into item from public.inventory where id=(snapshot->>'id')::uuid and household_id=hid for update;
       if not found or item.deleted or item.version is distinct from (snapshot->>'version')::int then
         raise sqlstate 'PT409' using message='A later change prevents undo of this batch.';
       end if;
     end loop;
     update public.inventory set deleted=true,version=version+1,updated_at=now(),updated_by=uid
       where household_id=hid and id in(select (x->>'id')::uuid from jsonb_array_elements(ev.after_state->'items') x);
   else
     select * into item from public.inventory where id=ev.item_id and household_id=hid for update;
     if not found or item.version is distinct from (ev.after_state->>'version')::int then
       raise sqlstate 'PT409' using message='A later change prevents undo.';
     end if;
     previous:=to_jsonb(item);
     if ev.action='add_item' then
       update public.inventory set deleted=true,version=version+1,updated_at=now(),updated_by=uid where id=item.id returning * into item;
     else
       old_quantity:=item.quantity; old_unit:=item.unit;
       update public.inventory set name=ev.before_state->>'name',stock=(ev.before_state->>'stock')::smallint,
         quantity=(ev.before_state->>'quantity')::numeric,unit=ev.before_state->>'unit',
         expiry_date=(ev.before_state->>'expiry_date')::date,category=ev.before_state->>'category',location=ev.before_state->>'location',
         deleted=(ev.before_state->>'deleted')::boolean,version=version+1,updated_at=now(),updated_by=uid
         where id=item.id returning * into item;
       if item.quantity is not null and old_quantity is distinct from item.quantity then
         insert into public.quantity_events(household_id,item_id,name,category,unit,kind,amount,before_quantity,quantity)
           values(hid,item.id,item.name,item.category,item.unit,'undo',item.quantity-old_quantity,old_quantity,item.quantity);
       end if;
     end if;
   end if;
   update public.quantity_events set voided=true where quantity_events.activity_id=ev.id;
   insert into public.activity(household_id,actor_id,action,item_id,label,before_state,after_state)
     values(hid,uid,'undo',case when ev.action='add_items' then null else item.id end,'Reversed inventory change',ev.after_state,
       case when ev.action='add_items' then null else to_jsonb(item) end);
   return '{}'::jsonb;
 end if;
 if command in ('add_item','edit_item') then perform private.check_quantity_item(payload,command='add_item'); end if;
 if command='add_item' then
   insert into public.inventory(household_id,name,quantity,unit,expiry_date,category,location,updated_by)
     values(hid,trim(payload->>'name'),private.exact_amount(payload->'quantity',true),payload->>'unit',(payload->>'expiry_date')::date,
       trim(payload->>'category'),trim(payload->>'location'),uid) returning * into item;
 else
   select * into item from public.inventory where id=(payload->>'id')::uuid and household_id=hid for update;
   if not found or item.deleted or item.version is distinct from (payload->>'version')::int then
     raise sqlstate 'PT409' using message='This item changed. Reload and review it before saving.';
   end if;
   previous:=to_jsonb(item);
   if command='edit_item' then
     if item.unit is not null and item.unit is distinct from payload->>'unit' then raise exception 'Use the recorded unit. Add a separate item for a different unit.'; end if;
     update public.inventory set name=trim(payload->>'name'),quantity=private.exact_amount(payload->'quantity'),unit=payload->>'unit',
       expiry_date=(payload->>'expiry_date')::date,category=trim(payload->>'category'),location=trim(payload->>'location'),
       version=version+1,updated_by=uid,updated_at=now() where id=item.id returning * into item;
   elsif command='remove_item' then
     update public.inventory set deleted=true,version=version+1,updated_by=uid,updated_at=now() where id=item.id returning * into item;
   else
     if item.quantity is null then raise exception 'Set a measured amount first.'; end if;
     if payload->>'kind' is null or payload->>'kind' not in ('restock','discarded') then raise exception 'Choose restock or waste.'; end if;
     amount:=private.exact_amount(payload->'amount',true); reason:=payload->>'discardReason';
     if payload->>'kind'='discarded' and (reason is null or reason not in ('spoiled','past_date','prep','other')) then raise exception 'Choose a waste reason.'; end if;
     if payload->>'kind'='restock' and reason is not null then raise exception 'Restocks have no waste reason.'; end if;
     delta:=case when payload->>'kind'='restock' then amount else -amount end;
     if item.quantity+delta not between 0 and 1000000 then raise exception 'Amount exceeds the available quantity or storage limit.'; end if;
     update public.inventory set quantity=quantity+delta,version=version+1,updated_by=uid,updated_at=now() where id=item.id returning * into item;
   end if;
 end if;
 if item.location<>'' and not(item.location=any(h.locations)) then update public.households set locations=array_append(locations,item.location) where id=hid; end if;
 insert into public.activity(household_id,actor_id,action,item_id,label,before_state,after_state)
   values(hid,uid,command,item.id,item.name,previous,to_jsonb(item)) returning id into activity_id;
 if command='add_item' or (command='edit_item' and previous->>'quantity' is null) then
   insert into public.quantity_events(household_id,item_id,activity_id,name,category,unit,kind,amount,before_quantity,quantity)
     values(hid,item.id,activity_id,item.name,item.category,item.unit,'opening',item.quantity,null,item.quantity);
 elsif command='adjust_item' or (command='edit_item' and item.quantity is distinct from (previous->>'quantity')::numeric) then
   insert into public.quantity_events(household_id,item_id,activity_id,name,category,unit,kind,amount,before_quantity,quantity,discard_reason)
     values(hid,item.id,activity_id,item.name,item.category,item.unit,case when command='edit_item' then 'adjustment' else payload->>'kind' end,
       item.quantity-(previous->>'quantity')::numeric,(previous->>'quantity')::numeric,item.quantity,reason);
 end if;
 return to_jsonb(item);
end $$;
revoke all on function private.mutate_single(text,jsonb) from public,anon,authenticated;
revoke all on function public.mutate(text,jsonb) from public,anon;
grant execute on function public.mutate(text,jsonb) to authenticated;

create or replace function public.add_inventory_batch(expected_household uuid,request_id uuid,items_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); hid uuid; h public.households; entry jsonb; item public.inventory;
 previous_import private.inventory_imports; fingerprint text; ids uuid[]:='{}'; snapshots jsonb:='[]'; activity_id bigint;
begin
 if uid is null then raise sqlstate '42501' using message='Sign in to continue.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 hid:=private.household();
 if hid is null or hid is distinct from expected_household then raise sqlstate 'PT409' using message='Your household changed. Reload before adding ingredients.'; end if;
 select * into h from public.households where id=hid for update;
 if not found or not exists(select 1 from public.memberships where user_id=uid and household_id=hid) then raise sqlstate '42501' using message='Household access is no longer available.'; end if;
 if request_id is null or jsonb_typeof(items_data) is distinct from 'array' then raise exception 'Invalid batch.'; end if;
 if jsonb_array_length(items_data) not between 1 and 10 then raise exception 'Add between 1 and 10 ingredients.'; end if;
 fingerprint:=encode(extensions.digest(items_data::text,'sha256'),'hex');
 select * into previous_import from private.inventory_imports i where i.request_id=add_inventory_batch.request_id;
 if found then
   if previous_import.actor_id<>uid or previous_import.household_id<>hid or previous_import.payload_hash<>fingerprint then raise sqlstate 'PT409' using message='This save request already has different details. Reload and review.'; end if;
   return jsonb_build_object('ids',previous_import.item_ids,'count',cardinality(previous_import.item_ids));
 end if;
 for entry in select * from jsonb_array_elements(items_data) loop
   perform private.check_quantity_item(entry,true);
   insert into public.inventory(household_id,name,quantity,unit,expiry_date,category,location,updated_by)
     values(hid,trim(entry->>'name'),private.exact_amount(entry->'quantity',true),entry->>'unit',(entry->>'expiry_date')::date,
       trim(entry->>'category'),trim(entry->>'location'),uid) returning * into item;
   ids:=array_append(ids,item.id); snapshots:=snapshots||jsonb_build_array(to_jsonb(item));
   if item.location<>'' and not(item.location=any(h.locations)) then h.locations:=array_append(h.locations,item.location); end if;
 end loop;
 update public.households set locations=h.locations where id=hid;
 insert into public.activity(household_id,actor_id,action,label,after_state)
   values(hid,uid,'add_items','Added '||cardinality(ids)||' ingredients',jsonb_build_object('items',snapshots)) returning id into activity_id;
 insert into public.quantity_events(household_id,item_id,activity_id,name,category,unit,kind,amount,before_quantity,quantity)
   select hid,(x->>'id')::uuid,activity_id,x->>'name',x->>'category',x->>'unit','opening',(x->>'quantity')::numeric,null,(x->>'quantity')::numeric
   from jsonb_array_elements(snapshots) x;
 insert into private.inventory_imports(request_id,actor_id,household_id,payload_hash,item_ids) values(request_id,uid,hid,fingerprint,ids);
 return jsonb_build_object('ids',ids,'count',cardinality(ids));
end $$;
revoke all on function public.add_inventory_batch(uuid,uuid,jsonb) from public,anon;
grant execute on function public.add_inventory_batch(uuid,uuid,jsonb) to authenticated;

create or replace function public.confirm_meal(actor uuid,household uuid,session_id uuid,recipe_data jsonb,changes jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare row_change jsonb; recipe_item jsonb; item public.inventory; used_amount numeric; discarded_amount numeric;
 intermediate numeric; remaining numeric; reason text; entries jsonb:='[]';
begin
 perform 1 from public.households where id=household for update;
 if not found or not exists(select 1 from public.memberships where user_id=actor and household_id=household) then raise sqlstate '42501' using message='Household access is no longer available.'; end if;
 if session_id is null then raise exception 'Invalid cooking session.'; end if;
 if exists(select 1 from public.outcomes where id=session_id) then
   if exists(select 1 from public.outcomes where id=session_id and actor_id=actor and household_id=household and recipe=recipe_data) then return session_id; end if;
   raise sqlstate 'PT409' using message='This cooking session was already recorded.';
 end if;
 if jsonb_typeof(recipe_data->'ingredients') is distinct from 'array' or jsonb_typeof(recipe_data->'name') is distinct from 'string'
   or length(trim(recipe_data->>'name')) not between 1 and 100 then raise exception 'Invalid recipe.'; end if;
 if jsonb_typeof(changes) is distinct from 'array' then raise exception 'Invalid ingredient changes.'; end if;
 if jsonb_array_length(changes) not between 1 and 100
   or (select count(distinct x->>'id') from jsonb_array_elements(changes) x)<>jsonb_array_length(changes)
   or (select count(*) from jsonb_array_elements(recipe_data->'ingredients') x where x->>'ingredientId' not like 'staple-%')<>jsonb_array_length(changes)
   or (select count(distinct x->>'ingredientId') from jsonb_array_elements(recipe_data->'ingredients') x)<>jsonb_array_length(recipe_data->'ingredients') then
   raise exception 'Review every tracked recipe ingredient exactly once.';
 end if;
 for row_change in select * from jsonb_array_elements(changes) order by value->>'id' loop
   select x into recipe_item from jsonb_array_elements(recipe_data->'ingredients') x where x->>'ingredientId'=row_change->>'id';
   if not found then raise exception 'Ingredient is outside this recipe.'; end if;
   perform private.exact_amount(recipe_item->'amount',true);
   select * into item from public.inventory where id=(row_change->>'id')::uuid and household_id=household for update;
   if not found or item.deleted or item.version is distinct from (row_change->>'version')::int or item.quantity is null or item.unit is null then
     raise sqlstate 'PT409' using message='An ingredient changed. Load its latest amount and review again.';
   end if;
   if item.unit is distinct from recipe_item->>'unit' then raise exception 'Recipe unit differs from the recorded unit.'; end if;
   if item.expiry_date<(now() at time zone 'Asia/Singapore')::date then raise exception 'A recipe ingredient is past its expiry date.'; end if;
   used_amount:=private.exact_amount(row_change->'usedAmount'); discarded_amount:=private.exact_amount(row_change->'discardedAmount'); reason:=row_change->>'discardReason';
   if used_amount+discarded_amount>item.quantity then raise exception 'Used and wasted amounts exceed the available quantity.'; end if;
   if discarded_amount>0 and (reason is null or reason not in ('spoiled','past_date','prep','other')) then raise exception 'Choose a waste reason.'; end if;
   if discarded_amount=0 and reason is not null then raise exception 'Choose a reason only when recording waste.'; end if;
   intermediate:=item.quantity-used_amount; remaining:=intermediate-discarded_amount;
   entries:=entries||jsonb_build_array(jsonb_build_object('id',item.id,'name',item.name,'category',item.category,'unit',item.unit,
     'used',used_amount>0,'discarded',discarded_amount>0,'before_quantity',item.quantity,'quantity',remaining,
     'used_amount',used_amount,'discarded_amount',discarded_amount,'discard_reason',reason));
   update public.inventory set quantity=remaining,version=version+1,updated_by=actor,updated_at=now() where id=item.id;
   if used_amount>0 then insert into public.quantity_events(household_id,item_id,name,category,unit,kind,amount,before_quantity,quantity)
     values(household,item.id,item.name,item.category,item.unit,'used',-used_amount,item.quantity,intermediate); end if;
   if discarded_amount>0 then insert into public.quantity_events(household_id,item_id,name,category,unit,kind,amount,before_quantity,quantity,discard_reason)
     values(household,item.id,item.name,item.category,item.unit,'discarded',-discarded_amount,intermediate,remaining,reason); end if;
 end loop;
 insert into public.outcomes(id,household_id,actor_id,recipe,ingredients) values(session_id,household,actor,recipe_data,entries);
 insert into public.activity(household_id,actor_id,action,label) values(household,actor,'confirmed_meal',recipe_data->>'name');
 return session_id;
end $$;
revoke all on function public.confirm_meal(uuid,uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.confirm_meal(uuid,uuid,uuid,jsonb,jsonb) to service_role;

-- The application creates the seed; this service-only transaction validates its entire ledger.
drop function public.reset_demo(uuid,uuid,int,jsonb,jsonb);
create function public.reset_demo(actor uuid,household uuid,expected_version int,items_data jsonb,outcomes_data jsonb,events_data jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare h public.households; entry jsonb; event jsonb; seed_item jsonb; previous_event jsonb; current_amount numeric; event_amount numeric;
begin
 select * into h from public.households where id=household for update;
 if not found or h.owner_id is distinct from actor or not exists(select 1 from public.memberships where user_id=actor and household_id=household) then
   raise sqlstate '42501' using message='Only the household owner can reset demo data.';
 end if;
 if h.version is distinct from expected_version then raise sqlstate 'PT409' using message='Your household changed. Refresh before resetting.'; end if;
 if jsonb_typeof(items_data) is distinct from 'array' or jsonb_typeof(outcomes_data) is distinct from 'array' or jsonb_typeof(events_data) is distinct from 'array' then raise exception 'Invalid demo seed.'; end if;
 if jsonb_array_length(items_data)<>40 or jsonb_array_length(outcomes_data)<>14 or jsonb_array_length(events_data)<40
   or (select count(distinct x->>'id') from jsonb_array_elements(items_data) x)<>40
   or (select count(distinct x->>'id') from jsonb_array_elements(outcomes_data) x)<>14
   or (select count(distinct x->>'id') from jsonb_array_elements(events_data) x)<>jsonb_array_length(events_data) then raise exception 'Invalid demo seed counts or IDs.'; end if;
 for entry in select * from jsonb_array_elements(items_data) loop
   perform private.check_quantity_item(entry,true); perform (entry->>'id')::uuid;
   current_amount:=null; previous_event:=null;
   for event in select x from jsonb_array_elements(events_data) with ordinality e(x,n) where x->>'item_id'=entry->>'id' order by (x->>'created_at')::timestamptz,n loop
     if event->>'unit' is distinct from entry->>'unit' or event->>'name' is distinct from entry->>'name' or event->>'category' is distinct from entry->>'category' then raise exception 'Seed ledger differs from its inventory item.'; end if;
     perform (event->>'id')::uuid;
     if (event->>'created_at')::timestamptz is null then raise exception 'Seed events require a date.'; end if;
     if jsonb_typeof(event->'amount') is distinct from 'number' then raise exception 'Seed event requires an amount.'; end if;
     event_amount:=private.exact_amount(to_jsonb(abs((event->>'amount')::numeric)));
     if (event->>'amount')::numeric<0 then event_amount:=-event_amount; end if;
     if previous_event is null then
       if event->>'kind' is distinct from 'opening' or event->>'before_quantity' is not null or event_amount<>private.exact_amount(event->'quantity') then raise exception 'Seed history requires a balanced opening.'; end if;
     else
       if event->>'kind'='opening' or private.exact_amount(event->'before_quantity')<>current_amount
         or current_amount+event_amount<>private.exact_amount(event->'quantity') then raise exception 'Seed history is inconsistent.'; end if;
     end if;
     current_amount:=private.exact_amount(event->'quantity'); previous_event:=event;
   end loop;
   if current_amount is distinct from private.exact_amount(entry->'quantity') then raise exception 'Seed current amount differs from its history.'; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(events_data) e where not exists(select 1 from jsonb_array_elements(items_data) i where i->>'id'=e->>'item_id')) then raise exception 'Seed event references another item.'; end if;
 for entry in select * from jsonb_array_elements(outcomes_data) loop
   if jsonb_typeof(entry->'recipe'->'name') is distinct from 'string' or length(entry->'recipe'->>'name') not between 1 and 100
     or jsonb_typeof(entry->'ingredients') is distinct from 'array' or jsonb_array_length(entry->'ingredients')=0 or (entry->>'created_at')::timestamptz is null then raise exception 'Invalid demo meal history.'; end if;
   for event in select * from jsonb_array_elements(entry->'ingredients') loop
     select x into seed_item from jsonb_array_elements(items_data) x where x->>'id'=event->>'id';
     if not found or event->>'unit' is distinct from seed_item->>'unit' then raise exception 'Seed meal references another item or unit.'; end if;
     if private.exact_amount(event->'before_quantity')-private.exact_amount(event->'used_amount')-private.exact_amount(event->'discarded_amount')<>private.exact_amount(event->'quantity') then raise exception 'Seed meal quantities are inconsistent.'; end if;
   end loop;
 end loop;
 delete from private.inventory_imports where household_id=household;
 delete from public.quantity_events where household_id=household;
 delete from public.activity where household_id=household;
 delete from public.outcomes where household_id=household;
 delete from public.inventory where household_id=household;
 insert into public.inventory(id,household_id,name,quantity,unit,expiry_date,category,location,updated_by)
   select id,household,name,quantity,unit,expiry_date,category,location,actor
   from jsonb_to_recordset(items_data) as x(id uuid,name text,quantity numeric,unit text,expiry_date date,category text,location text);
 insert into public.outcomes(id,household_id,actor_id,recipe,ingredients,synthetic,created_at)
   select id,household,case when exists(select 1 from public.memberships where user_id=x.actor_id and household_id=household) then x.actor_id else actor end,recipe,ingredients,true,created_at
   from jsonb_to_recordset(outcomes_data) as x(id uuid,actor_id uuid,recipe jsonb,ingredients jsonb,created_at timestamptz);
 insert into public.quantity_events(id,item_id,household_id,name,category,unit,kind,amount,before_quantity,quantity,created_at,synthetic,discard_reason)
   select id,item_id,household,name,category,unit,kind,amount,before_quantity,quantity,created_at,true,discard_reason
   from jsonb_to_recordset(events_data) as x(id uuid,item_id uuid,name text,category text,unit text,kind text,amount numeric,before_quantity numeric,quantity numeric,created_at timestamptz,discard_reason text);
 update public.households set version=version+1,locations=array(select distinct unnest(h.locations||array(select distinct location from public.inventory where household_id=household and location<>''))) where id=household;
 insert into public.activity(household_id,actor_id,action,label) values(household,actor,'demo_reset','Restored demo inventory and history');
end $$;
revoke all on function public.reset_demo(uuid,uuid,int,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.reset_demo(uuid,uuid,int,jsonb,jsonb,jsonb) to service_role;
