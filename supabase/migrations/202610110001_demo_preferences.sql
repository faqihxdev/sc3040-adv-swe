create or replace function public.reset_demo(actor uuid,household uuid,expected_version int,items_data jsonb,outcomes_data jsonb,events_data jsonb)
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
 update public.profiles set exclusions='{}'
   where id in (select user_id from public.memberships where household_id=household);
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
 insert into public.activity(household_id,actor_id,action,label) values(household,actor,'demo_reset','Restored demo data and cleared dietary exclusions');
end $$;
revoke all on function public.reset_demo(uuid,uuid,int,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.reset_demo(uuid,uuid,int,jsonb,jsonb,jsonb) to service_role;
