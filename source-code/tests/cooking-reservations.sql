begin;
do $$
declare owner_id uuid:=gen_random_uuid(); member_id uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
 hid uuid; other_hid uuid; rice public.inventory; eggs public.inventory; result jsonb; code text;
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); recipe_a jsonb; recipe_b jsonb; recipe_bad jsonb; changes jsonb;
 failed boolean; before_events int; before_outcomes int; first_expiry timestamptz;
begin
 insert into auth.users(id,email) values(owner_id,owner_id||'@res.test'),(member_id,member_id||'@res.test'),(outsider,outsider||'@res.test');
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 hid:=(public.mutate('create_household','{"name":"Reservation tests"}')->>'id')::uuid;
 code:=public.mutate('invite','{}')->>'code';
 result:=public.mutate('add_item','{"name":"Rice","quantity":500,"unit":"g","expiry_date":"2099-12-31","category":"Grains","location":"Pantry"}');
 select * into rice from public.inventory where id=(result->>'id')::uuid;
 result:=public.mutate('add_item','{"name":"Eggs","quantity":6,"unit":"piece","expiry_date":"2099-12-31","category":"Protein","location":"Fridge"}');
 select * into eggs from public.inventory where id=(result->>'id')::uuid;
 perform set_config('request.jwt.claim.sub',member_id::text,true);
 perform public.mutate('join_household',jsonb_build_object('code',code));
 perform set_config('request.jwt.claim.sub',outsider::text,true);
 other_hid:=(public.mutate('create_household','{"name":"Other reservations"}')->>'id')::uuid;
 recipe_a:=jsonb_build_object('name','Rice and eggs','ingredients',jsonb_build_array(
   jsonb_build_object('ingredientId',rice.id,'amount',300,'unit','g'),jsonb_build_object('ingredientId',eggs.id,'amount',1,'unit','piece')));
 recipe_b:=jsonb_build_object('name','Rice','ingredients',jsonb_build_array(jsonb_build_object('ingredientId',rice.id,'amount',250,'unit','g')));
 before_events:=(select count(*) from public.quantity_events where household_id=hid);
 before_outcomes:=(select count(*) from public.outcomes where household_id=hid);

 failed:=false; begin perform public.start_cooking(outsider,hid,a,recipe_a,'{}'); exception when insufficient_privilege then failed:=true; end;
 assert failed,'Outsider started a reservation';
 perform public.start_cooking(owner_id,hid,a,recipe_a,'{}');
 select expires_at into first_expiry from public.cooking_sessions where id=a;
 perform public.start_cooking(owner_id,hid,a,recipe_a,'{}');
 assert (select expires_at=first_expiry from public.cooking_sessions where id=a),'Start retry changed the session';
 assert (select count(*) from public.ingredient_reservations where session_id=a)=2,'Start retry duplicated holds';
 assert (select quantity=500 and version=rice.version from public.inventory where id=rice.id),'Reservation consumed or versioned stock';
 assert (select count(*) from public.quantity_events where household_id=hid)=before_events,'Reservation polluted quantity analytics';
 assert (select count(*) from public.outcomes where household_id=hid)=before_outcomes,'Reservation recorded a meal';
 recipe_bad:=jsonb_build_object('name','Partially unavailable meal','ingredients',jsonb_build_array(
   jsonb_build_object('ingredientId',rice.id,'amount',case when rice.id<eggs.id then 1 else 501 end,'unit','g'),
   jsonb_build_object('ingredientId',eggs.id,'amount',case when eggs.id<rice.id then 1 else 7 end,'unit','piece')));
 failed:=false; begin perform public.start_cooking(member_id,hid,b,recipe_bad,'{}'); exception when sqlstate 'PT409' then failed:=true; end;
 assert failed and not exists(select 1 from public.ingredient_reservations where session_id=b),'Multi-ingredient failure retained partial holds';
 failed:=false; begin perform public.start_cooking(member_id,hid,b,recipe_b,'{}'); exception when sqlstate 'PT409' then failed:=true; end;
 assert failed and not exists(select 1 from public.cooking_sessions where id=b),'Insufficient reservation partially saved';
 recipe_b:=jsonb_set(recipe_b,'{ingredients,0,amount}','200');
 perform public.start_cooking(member_id,hid,b,recipe_b,'{}');
 assert (select sum(amount)=500 from public.ingredient_reservations where item_id=rice.id),'Members could not share portions';
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform public.mutate('transfer',jsonb_build_object('user_id',member_id,'version',(select version from public.households where id=hid)));
 assert (select count(*) from public.cooking_sessions where household_id=hid)=2,'Ownership transfer dropped sessions';
 perform set_config('request.jwt.claim.sub',member_id::text,true);
 perform public.mutate('transfer',jsonb_build_object('user_id',owner_id,'version',(select version from public.households where id=hid)));
 failed:=false; begin perform public.start_cooking(owner_id,hid,gen_random_uuid(),recipe_b,'{}'); exception when sqlstate 'PT409' then failed:=true; end;
 assert failed,'Member opened two cooking sessions';

 perform set_config('request.jwt.claim.sub',member_id::text,true);
 perform set_config('role','authenticated',true);
 assert jsonb_array_length(public.cooking_state()->'reservations')=3,'Household cannot see shared holds';
 assert public.cooking_state()->'session'->>'id'=b::text,'Another member session was exposed as own';
 failed:=false; begin select count(*) into before_events from public.cooking_sessions; exception when insufficient_privilege then failed:=true; end;
 assert failed,'Raw cooking session data readable';
 assert not has_function_privilege('authenticated','public.start_cooking(uuid,uuid,uuid,jsonb,jsonb)','execute'),'Client can forge a start';
 assert not has_function_privilege('authenticated','public.confirm_reserved_meal(uuid,uuid,uuid,jsonb,jsonb)','execute'),'Client can forge a confirmation';
 perform set_config('role','postgres',true);
 perform set_config('request.jwt.claim.sub',outsider::text,true);
 assert jsonb_array_length(public.cooking_state()->'reservations')=0,'Reservation RLS leaked another household';

 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 failed:=false; begin perform public.mutate('remove_item',to_jsonb(rice)); exception when sqlstate 'PT409' then failed:=true; end;
 assert failed,'Soft deletion removed reserved stock';
 failed:=false; begin delete from public.inventory where id=rice.id; exception when sqlstate 'PT409' then failed:=true; end;
 assert failed,'Hard deletion removed reserved stock';
 failed:=false; begin perform public.mutate('edit_item',to_jsonb(rice)||'{"quantity":499}'); exception when sqlstate 'PT409' then failed:=true; end;
 assert failed,'Edit consumed reserved stock';
 failed:=false; begin perform public.mutate('edit_item',to_jsonb(rice)||'{"name":"Something else"}'); exception when sqlstate 'PT409' then failed:=true; end;
 assert failed,'Rename changed a reserved recipe ingredient';
 failed:=false; begin perform public.mutate('adjust_item',jsonb_build_object('id',rice.id,'version',rice.version,'kind','discarded','amount',1,'discardReason','spoiled')); exception when sqlstate 'PT409' then failed:=true; end;
 assert failed,'Waste consumed reserved stock';
 failed:=false; begin perform public.mutate('undo','{}'); exception when sqlstate 'PT409' then failed:=true; end;
 assert failed,'Undo deleted reserved eggs';

 -- Restock is allowed. Undo cannot remove a newly reserved part of that restock.
 perform public.mutate('adjust_item',jsonb_build_object('id',rice.id,'version',rice.version,'kind','restock','amount',100,'discardReason',null));
 select * into rice from public.inventory where id=rice.id;
 changes:=jsonb_build_array(jsonb_build_object('id',rice.id,'version',rice.version,'usedAmount',401,'discardedAmount',0,'discardReason',null),
   jsonb_build_object('id',eggs.id,'version',eggs.version,'usedAmount',1,'discardedAmount',0,'discardReason',null));
 failed:=false; begin perform public.confirm_reserved_meal(owner_id,hid,a,recipe_a,changes); exception when sqlstate 'PT409' then failed:=true; end;
 assert failed,'Overuse stole another member portions';
 assert exists(select 1 from public.cooking_sessions where id=a),'Failed confirmation released own hold';
 assert (select quantity=600 from public.inventory where id=rice.id),'Failed confirmation changed quantity';
 -- Strict confirmation cannot bypass an expired hold.
 update public.cooking_sessions set expires_at=clock_timestamp()-interval '1 second' where id=a;
 failed:=false; begin perform public.manage_cooking(owner_id,hid,a,'renew'); exception when sqlstate 'PT409' then failed:=true; end;
 assert failed,'Renew resurrected expired portions';
 failed:=false; begin perform public.confirm_reserved_meal(owner_id,hid,a,recipe_a,changes); exception when sqlstate 'PT409' then failed:=true; end;
 assert failed,'Expired cooking session confirmed';
 -- A stale browser can reacquire all portions atomically, then review actual amounts.
 perform public.start_cooking(owner_id,hid,a,recipe_a,'{}');
 perform public.manage_cooking(owner_id,hid,a,'renew');
 assert (select expires_at>clock_timestamp()+interval '119 minutes' from public.cooking_sessions where id=a),'Renew did not extend lease';
 changes:=jsonb_set(changes,'{0,usedAmount}','350');
 changes:=jsonb_set(changes,'{0,discardedAmount}','20');
 changes:=jsonb_set(changes,'{0,discardReason}','"prep"');
 perform public.confirm_reserved_meal(owner_id,hid,a,recipe_a,changes);
 perform public.confirm_reserved_meal(owner_id,hid,a,recipe_a,changes);
 assert (select quantity=230 from public.inventory where id=rice.id),'Confirmation deducted twice or ignored actual use';
 assert (select count(*) from public.outcomes where id=a)=1,'Confirmation retry duplicated history';
 assert not exists(select 1 from public.cooking_sessions where id=a),'Confirmed meal retained hold';
 assert exists(select 1 from public.cooking_sessions where id=b),'Confirmation released another member hold';
 failed:=false; begin perform public.start_cooking(owner_id,hid,a,recipe_a,'{}'); exception when sqlstate 'PT409' then failed:=true; end;
 assert failed,'Completed ticket reused';
 perform public.manage_cooking(owner_id,hid,b,'cancel');
 assert exists(select 1 from public.cooking_sessions where id=b),'Another member could cancel hold';
 perform public.manage_cooking(member_id,hid,b,'cancel');
 perform public.manage_cooking(member_id,hid,b,'cancel');
 assert not exists(select 1 from public.ingredient_reservations where session_id=b),'Cancel left held portions';

 -- An undo of a restock must preserve portions reserved after that restock.
 select * into rice from public.inventory where id=rice.id;
 perform public.mutate('adjust_item',jsonb_build_object('id',rice.id,'version',rice.version,'kind','restock','amount',100,'discardReason',null));
 b:=gen_random_uuid(); recipe_b:=jsonb_set(recipe_b,'{ingredients,0,amount}','300');
 perform public.start_cooking(member_id,hid,b,recipe_b,'{}');
 failed:=false; begin perform public.mutate('undo','{}'); exception when sqlstate 'PT409' then failed:=true; end;
 assert failed,'Restock undo consumed a newer reservation';
 perform public.manage_cooking(member_id,hid,b,'cancel');
 b:=gen_random_uuid(); recipe_b:=jsonb_set(recipe_b,'{ingredients,0,amount}','100');
 perform public.start_cooking(member_id,hid,b,recipe_b,'{}');
 perform set_config('request.jwt.claim.sub',member_id::text,true);
 perform public.mutate('leave',jsonb_build_object('version',(select version from public.households where id=hid)));
 assert not exists(select 1 from public.cooking_sessions where id=b),'Leave left held portions';
 perform public.mutate('join_household',jsonb_build_object('code',code));
 b:=gen_random_uuid(); perform public.start_cooking(member_id,hid,b,recipe_b,'{}');
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 perform public.mutate('remove_member',jsonb_build_object('user_id',member_id,'version',(select version from public.households where id=hid)));
 assert not exists(select 1 from public.cooking_sessions where id=b),'Removal left held portions';
 perform set_config('request.jwt.claim.sub',member_id::text,true);
 perform public.mutate('join_household',jsonb_build_object('code',code));
 b:=gen_random_uuid(); perform public.start_cooking(member_id,hid,b,recipe_b,'{}');
 update public.memberships set household_id=other_hid where user_id=member_id;
 assert not exists(select 1 from public.cooking_sessions where id=b),'Administrative membership move left held portions';
 update public.memberships set household_id=hid where user_id=member_id;
 b:=gen_random_uuid(); perform public.start_cooking(member_id,hid,b,recipe_b,'{}');
 delete from auth.users where id=member_id;
 assert not exists(select 1 from public.cooking_sessions where id=b),'Account deletion left held portions';
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 -- Household deletion cascades through held inventory and sessions.
 perform public.start_cooking(owner_id,hid,gen_random_uuid(),recipe_b,'{}');
 perform public.mutate('delete_household',jsonb_build_object('version',(select version from public.households where id=hid),'confirmation','Reservation tests'));
 assert not exists(select 1 from public.cooking_sessions where household_id=hid),'Household deletion left sessions';
 raise notice 'PASS: reservations, atomic failure, sharing, idempotency, stock guards, overuse, expiry, renewal, RLS, cancellation and membership cleanup';
end $$;
rollback;
