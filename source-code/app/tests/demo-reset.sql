begin;
do $$
declare uid uuid; teammate uuid; hid uuid; other_hid uuid; version_before int;
 items_data jsonb; outcomes_data jsonb; old_ids uuid[]; failed boolean;
 budget_before int; profiles_before int; members_before int; other_before int; outcome_before int;
begin
 select id into uid from auth.users where email='alex@useeatnow.test';
 select id into teammate from auth.users where email='sam@useeatnow.test';
 if uid is null or teammate is null then raise exception 'Run db:seed before this test.'; end if;
 select household_id into hid from public.memberships where user_id=uid;
 select version into version_before from public.households where id=hid;
 select count(*) into budget_before from private.ai_calls;
 select count(*) into profiles_before from public.profiles;
 select count(*) into members_before from public.memberships;
 select count(*) into other_before from public.inventory where household_id<>hid;
 select count(*) into outcome_before from public.outcomes where household_id=hid;
 select array_agg(id) into old_ids from public.inventory where household_id=hid;
 select jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'name','Reset item '||n,
   'stock',3,'expiry_date',current_date+3,'category','Protein','location','Fridge')) into items_data from generate_series(1,16) n;
 select jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'actor_id',uid,'recipe',jsonb_build_object('name','Reset meal'),
   'ingredients','[]'::jsonb,'created_at',now())) into outcomes_data from generate_series(1,14);
 assert not has_function_privilege('anon','public.reset_demo(uuid,uuid,int,jsonb,jsonb)','execute'), 'Anonymous reset is exposed';
 assert not has_function_privilege('authenticated','public.reset_demo(uuid,uuid,int,jsonb,jsonb)','execute'), 'Browser role can reset directly';
 assert has_function_privilege('service_role','public.reset_demo(uuid,uuid,int,jsonb,jsonb)','execute'), 'Server role cannot reset';
 failed:=false;
 begin perform public.reset_demo(teammate,hid,version_before,items_data,outcomes_data); exception when sqlstate '42501' then failed:=true; end;
 assert failed, 'Member reset accepted';
 select id into other_hid from public.households where id<>hid limit 1;
 if other_hid is not null then
   failed:=false;
   begin perform public.reset_demo(uid,other_hid,version_before,items_data,outcomes_data); exception when sqlstate '42501' then failed:=true; end;
   assert failed, 'Cross-household reset accepted';
 end if;
 failed:=false;
 begin perform public.reset_demo(uid,hid,version_before+1,items_data,outcomes_data); exception when sqlstate 'PT409' then failed:=true; end;
 assert failed, 'Stale reset accepted';
 failed:=false;
 begin perform public.reset_demo(uid,hid,version_before,jsonb_set(items_data,'{0,stock}','9'),outcomes_data); exception when check_violation then failed:=true; end;
 assert failed, 'Invalid seed accepted';
 assert (select array_agg(id order by id) from public.inventory where household_id=hid)=(select array_agg(x order by x) from unnest(old_ids) x), 'Failed reset removed inventory';
 assert (select count(*) from public.outcomes where household_id=hid)=outcome_before, 'Failed reset removed history';
 perform public.reset_demo(uid,hid,version_before,items_data,outcomes_data);
 assert (select count(*) from public.inventory where household_id=hid and not deleted)=16, 'Seed inventory count differs';
 assert not exists(select 1 from public.inventory where id=any(old_ids)), 'Old cooking-session IDs survived';
 assert (select count(*) from public.outcomes where household_id=hid and synthetic)=14, 'History is missing or unmarked';
 assert (select count(*) from public.activity where household_id=hid)=1, 'Activity was not reset';
 assert (select count(*) from private.inventory_imports where household_id=hid)=0, 'Import replay cache survived';
 assert (select version from public.households where id=hid)=version_before+1, 'Reset version was not advanced';
 assert (select count(*) from private.ai_calls)=budget_before, 'AI usage allowance was reset';
 assert (select count(*) from public.profiles)=profiles_before, 'Accounts changed';
 assert (select count(*) from public.memberships)=members_before, 'Membership changed';
 assert (select count(*) from public.inventory where household_id<>hid)=other_before, 'Another household changed';
 failed:=false;
 begin perform public.reset_demo(uid,hid,version_before,items_data,outcomes_data); exception when sqlstate 'PT409' then failed:=true; end;
 assert failed, 'Duplicate reset was accepted';
 raise notice 'PASS: demo reset permissions, owner/scope/version checks, rollback, fresh IDs, preserved accounts/members/AI quota';
end $$;
rollback;
