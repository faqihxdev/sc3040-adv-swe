begin;
do $$
declare uid uuid; teammate uuid; hid uuid; other_hid uuid; version_before int;
 items_data jsonb; outcomes_data jsonb; events_data jsonb := '[]'; old_ids uuid[]; failed boolean;
 budget_before int; profiles_before int; members_before int; other_before int; outcome_before int;
 bad_seed jsonb; other_preferences jsonb;
begin
 select id into uid from auth.users where email='alex@useeatnow.test';
 select id into teammate from auth.users where email='sam@useeatnow.test';
 if uid is null or teammate is null then raise exception 'Run db:seed before this test.'; end if;
 select household_id into hid from public.memberships where user_id=uid;
 update public.profiles set exclusions=array['Mushrooms'] where id=uid;
 update public.profiles set exclusions=array['Peanuts'] where id=teammate;
 select jsonb_agg(to_jsonb(p) order by p.id) into other_preferences from public.profiles p
   where p.id not in (select user_id from public.memberships where household_id=hid);
 select version into version_before from public.households where id=hid;
 select count(*) into budget_before from private.ai_calls;
 select count(*) into profiles_before from public.profiles;
 select count(*) into members_before from public.memberships;
 select count(*) into other_before from public.inventory where household_id<>hid;
 select count(*) into outcome_before from public.outcomes where household_id=hid;
 select array_agg(id) into old_ids from public.inventory where household_id=hid;
 select payload->'items',payload->'outcomes',coalesce(payload->'events','[]'::jsonb) into items_data,outcomes_data,events_data from pg_temp.test_demo_seed;
 assert jsonb_array_length(items_data)=40 and jsonb_array_length(outcomes_data)=14, 'Canonical demo seed differs';
 assert jsonb_array_length(events_data)>40, 'Canonical quantity event history is missing';
 select jsonb_agg(entry || jsonb_build_object('actor_id',case when n%2=1 then uid else teammate end))
   into outcomes_data from jsonb_array_elements(outcomes_data) with ordinality as x(entry,n);
 assert not has_function_privilege('anon','public.reset_demo(uuid,uuid,int,jsonb,jsonb,jsonb)','execute'), 'Anonymous reset is exposed';
 assert not has_function_privilege('authenticated','public.reset_demo(uuid,uuid,int,jsonb,jsonb,jsonb)','execute'), 'Browser role can reset directly';
 assert has_function_privilege('service_role','public.reset_demo(uuid,uuid,int,jsonb,jsonb,jsonb)','execute'), 'Server role cannot reset';
 failed:=false;
 begin perform public.reset_demo(teammate,hid,version_before,items_data,outcomes_data,events_data); exception when sqlstate '42501' then failed:=true; end;
 assert failed, 'Member reset accepted';
 select id into other_hid from public.households where id<>hid limit 1;
 if other_hid is not null then
   failed:=false;
   begin perform public.reset_demo(uid,other_hid,version_before,items_data,outcomes_data,events_data); exception when sqlstate '42501' then failed:=true; end;
   assert failed, 'Cross-household reset accepted';
 end if;
 failed:=false;
 begin perform public.reset_demo(uid,hid,version_before+1,items_data,outcomes_data,events_data); exception when sqlstate 'PT409' then failed:=true; end;
 assert failed, 'Stale reset accepted';
 for bad_seed in select value from (values ('null'::jsonb),('{}'::jsonb),('[]'::jsonb),(items_data-0)) as invalid(value) loop
   failed:=false;
    begin perform public.reset_demo(uid,hid,version_before,bad_seed,outcomes_data,events_data);
     exception when sqlstate 'P0001' then
       if sqlerrm not in ('Invalid demo seed.','Invalid demo seed counts or IDs.') then raise; end if;
       failed:=true;
   end;
   assert failed, 'Malformed or incomplete seed accepted';
 end loop;
 failed:=false;
 begin perform public.reset_demo(uid,hid,version_before,items_data,outcomes_data-0,events_data);
   exception when sqlstate 'P0001' then
     if sqlerrm not in ('Invalid demo seed.','Invalid demo seed counts or IDs.') then raise; end if;
     failed:=true;
 end;
 assert failed, 'Incomplete meal history accepted';
 failed:=false;
 begin perform public.reset_demo(uid,hid,version_before,jsonb_set(items_data,'{0,quantity}','"NaN"'),outcomes_data,events_data); exception when others then failed:=true; end;
 assert failed, 'Invalid seed accepted';
 failed:=false;
 begin perform public.reset_demo(uid,hid,version_before,items_data,outcomes_data,
   jsonb_set(events_data,'{0,discard_reason}','"invalid"'));
   exception when check_violation then failed:=true;
 end;
 assert failed, 'Invalid ledger insert accepted';
 assert (select array_agg(id order by id) from public.inventory where household_id=hid)=(select array_agg(x order by x) from unnest(old_ids) x), 'Failed reset removed inventory';
 assert (select count(*) from public.outcomes where household_id=hid)=outcome_before, 'Failed reset removed history';
 assert (select exclusions from public.profiles where id=uid)=array['Mushrooms'], 'Failed reset cleared owner preferences';
 assert (select exclusions from public.profiles where id=teammate)=array['Peanuts'], 'Failed reset cleared member preferences';
 perform public.reset_demo(uid,hid,version_before,items_data,outcomes_data,events_data);
 assert (select count(*) from public.inventory where household_id=hid and not deleted)=40, 'Seed inventory count differs';
 assert not exists(
   select 1 from jsonb_to_recordset(items_data) as x(id uuid,name text,quantity numeric,unit text,expiry_date date,category text,location text)
   left join public.inventory i on i.id=x.id and i.household_id=hid
   where i.id is null or row(i.name,i.quantity,i.unit,i.expiry_date,i.category,i.location)
     is distinct from row(x.name,x.quantity,x.unit,x.expiry_date,x.category,x.location)
 ), 'Canonical inventory fields changed';
 assert not exists(select 1 from public.inventory where id=any(old_ids)), 'Old cooking-session IDs survived';
 assert (select count(*) from public.outcomes where household_id=hid and synthetic)=14, 'History is missing or unmarked';
 assert not exists(select 1 from public.quantity_events e where e.household_id=hid and e.before_quantity is not null and e.before_quantity+e.amount<>e.quantity), 'Stored event history is unbalanced';
 assert not exists(select 1 from public.quantity_events e join public.inventory i on i.id=e.item_id where e.household_id=hid and not e.voided and e.quantity<>i.quantity and e.created_at=(select max(e2.created_at) from public.quantity_events e2 where e2.item_id=e.item_id and not e2.voided)), 'Latest event does not match inventory';
 assert (select count(distinct recipe->>'name') from public.outcomes where household_id=hid)=12, 'Canonical recipe variety changed';
 assert not exists(
   select 1 from public.outcomes o where o.household_id=hid and
     (jsonb_array_length(o.ingredients)=0 or exists(
       select 1 from jsonb_array_elements(o.ingredients) ingredient
       where not exists(select 1 from public.inventory i where i.id=(ingredient->>'id')::uuid and i.household_id=hid)
     ))
 ), 'Meal history has missing or unlinked ingredients';
 assert (select count(*) from public.activity where household_id=hid)=1, 'Activity was not reset';
 assert (select count(*) from private.inventory_imports where household_id=hid)=0, 'Import replay cache survived';
 assert (select version from public.households where id=hid)=version_before+1, 'Reset version was not advanced';
 assert (select count(*) from private.ai_calls)=budget_before, 'AI usage allowance was reset';
 assert (select count(*) from public.profiles)=profiles_before, 'Accounts changed';
 assert (select count(*) from public.memberships)=members_before, 'Membership changed';
 assert not exists(select 1 from public.profiles where id in
   (select user_id from public.memberships where household_id=hid) and cardinality(exclusions)<>0),
   'Demo household dietary exclusions survived';
 assert (select jsonb_agg(to_jsonb(p) order by p.id) from public.profiles p
   where p.id not in (select user_id from public.memberships where household_id=hid))
   is not distinct from other_preferences, 'Another household preferences changed';
 assert (select count(*) from public.inventory where household_id<>hid)=other_before, 'Another household changed';
 failed:=false;
 begin perform public.reset_demo(uid,hid,version_before,items_data,outcomes_data,events_data); exception when sqlstate 'PT409' then failed:=true; end;
 assert failed, 'Duplicate reset was accepted';
 raise notice 'PASS: canonical 40-item/14-outcome reset, dietary exclusions cleared for all members, owner/scope/version checks, rollback, preserved accounts/members/AI quota';
end $$;
rollback;
