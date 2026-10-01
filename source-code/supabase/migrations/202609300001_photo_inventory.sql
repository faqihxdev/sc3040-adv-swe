-- Photos produce drafts only. Confirmed batches share one transaction and undo event.
create table private.inventory_imports (
 request_id uuid primary key,
 actor_id uuid not null references auth.users on delete cascade,
 household_id uuid not null references public.households on delete cascade,
 payload_hash text not null,
 item_ids uuid[] not null,
 created_at timestamptz not null default now()
);
revoke all on private.inventory_imports from public, anon, authenticated;

create function public.add_inventory_batch(expected_household uuid, request_id uuid, items_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid := auth.uid(); hid uuid; h public.households; entry jsonb; item public.inventory;
 previous_import private.inventory_imports; fingerprint text; ids uuid[] := '{}'; snapshots jsonb := '[]';
begin
 if uid is null then raise sqlstate '42501' using message='Sign in to continue.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 hid := private.household();
 if hid is null or expected_household is distinct from hid then
   raise sqlstate 'PT409' using message='Your household changed. Reload before adding ingredients.';
 end if;
 select * into h from public.households where id=hid for update;
 if not found or not exists(select 1 from public.memberships where user_id=uid and household_id=hid) then
   raise sqlstate '42501' using message='Household access is no longer available.';
 end if;
 if request_id is null or jsonb_typeof(items_data) is distinct from 'array' then raise exception 'Invalid batch.'; end if;
 if jsonb_array_length(items_data) not between 1 and 10 then raise exception 'Add between 1 and 10 ingredients.'; end if;
 fingerprint := encode(extensions.digest(items_data::text,'sha256'),'hex');
 select * into previous_import from private.inventory_imports i where i.request_id=add_inventory_batch.request_id;
 if found then
   if previous_import.actor_id<>uid or previous_import.household_id<>hid or previous_import.payload_hash<>fingerprint then
     raise sqlstate 'PT409' using message='This save request already has different details. Reload and review.';
   end if;
   return jsonb_build_object('ids',previous_import.item_ids,'count',cardinality(previous_import.item_ids));
 end if;
 for entry in select * from jsonb_array_elements(items_data) loop
   if jsonb_typeof(entry) is distinct from 'object'
     or jsonb_typeof(entry->'name') is distinct from 'string'
     or length(trim(entry->>'name')) not between 1 and 100
     or jsonb_typeof(entry->'stock') is distinct from 'number'
     or (entry->>'stock') !~ '^[1-5]$'
     or jsonb_typeof(entry->'expiry_date') is distinct from 'string'
     or (entry->>'expiry_date') !~ '^\d{4}-\d{2}-\d{2}$'
     or jsonb_typeof(entry->'category') is distinct from 'string'
     or length(entry->>'category')>50
     or jsonb_typeof(entry->'location') is distinct from 'string'
     or length(entry->>'location')>50 then raise exception 'Check every ingredient name, stock level and expiry date.';
   end if;
   insert into public.inventory(household_id,name,stock,expiry_date,category,location,updated_by)
   values(hid,trim(entry->>'name'),(entry->>'stock')::smallint,(entry->>'expiry_date')::date,
     trim(entry->>'category'),trim(entry->>'location'),uid) returning * into item;
   ids := array_append(ids,item.id);
   snapshots := snapshots || jsonb_build_array(to_jsonb(item));
   if item.location<>'' and not(item.location=any(h.locations)) then
     h.locations := array_append(h.locations,item.location);
   end if;
 end loop;
 update public.households set locations=h.locations where id=hid;
 insert into public.activity(household_id,actor_id,action,label,after_state)
 values(hid,uid,'add_items','Added ' || cardinality(ids) || ' ingredients',jsonb_build_object('items',snapshots));
 insert into private.inventory_imports(request_id,actor_id,household_id,payload_hash,item_ids)
 values(request_id,uid,hid,fingerprint,ids);
 return jsonb_build_object('ids',ids,'count',cardinality(ids));
end $$;
revoke all on function public.add_inventory_batch(uuid,uuid,jsonb) from public,anon;
grant execute on function public.add_inventory_batch(uuid,uuid,jsonb) to authenticated;

-- Keep the existing single-item rules, but route undo through a batch-aware guard.
alter function public.mutate(text,jsonb) set schema private;
alter function private.mutate(text,jsonb) rename to mutate_single;
revoke all on function private.mutate_single(text,jsonb) from public,anon,authenticated;

create function public.mutate(command text, payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid(); hid uuid; ev public.activity; snapshot jsonb; item public.inventory;
begin
 if command is distinct from 'undo' then return private.mutate_single(command,payload); end if;
 if uid is null then raise sqlstate '42501' using message='Sign in to continue.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 hid := private.household();
 perform 1 from public.households where id=hid for update;
 if not found or not exists(select 1 from public.memberships where user_id=uid and household_id=hid) then
   raise sqlstate '42501' using message='Household access is no longer available.';
 end if;
 select * into ev from public.activity where household_id=hid and actor_id=uid
   and action in('add_item','add_items','edit_item','remove_item','undo') order by id desc limit 1;
 if not found or ev.action<>'add_items' then return private.mutate_single(command,payload); end if;
 for snapshot in select * from jsonb_array_elements(ev.after_state->'items') loop
   select * into item from public.inventory where id=(snapshot->>'id')::uuid and household_id=hid for update;
   if not found or item.deleted or item.version is distinct from (snapshot->>'version')::int then
     raise sqlstate 'PT409' using message='A later change prevents undo of this batch. No ingredients were removed.';
   end if;
 end loop;
 update public.inventory set deleted=true,version=version+1,updated_at=now(),updated_by=uid
 where household_id=hid and id in(select (x->>'id')::uuid from jsonb_array_elements(ev.after_state->'items') x);
 insert into public.activity(household_id,actor_id,action,label,before_state)
 values(hid,uid,'undo','Reversed ' || jsonb_array_length(ev.after_state->'items') || ' ingredient additions',ev.after_state);
 return '{}'::jsonb;
end $$;
revoke all on function public.mutate(text,jsonb) from public,anon;
grant execute on function public.mutate(text,jsonb) to authenticated;
