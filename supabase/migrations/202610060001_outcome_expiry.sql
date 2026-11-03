-- Preserve the inventory expiry date at confirmation; existing history stays unknown.
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
   entries:=entries||jsonb_build_array(jsonb_build_object('id',item.id,'name',item.name,'category',item.category,'unit',item.unit,'expiry_date',item.expiry_date,
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
