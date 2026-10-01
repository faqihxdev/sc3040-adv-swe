create or replace function public.confirm_meal(actor uuid, household uuid, session_id uuid, recipe_data jsonb, changes jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare h public.households; row_change jsonb; item public.inventory; entries jsonb:='[]'::jsonb;
begin
 select * into h from public.households where id=household for update;
 if not found or not exists(select 1 from public.memberships where user_id=actor and household_id=household) then raise sqlstate '42501' using message='Household access is no longer available.'; end if;
 if exists(select 1 from public.outcomes where id=session_id and actor_id=actor and household_id=household and recipe is distinct from recipe_data) then raise sqlstate 'PT409' using message='This session already recorded a different meal. Start a new session.'; end if;
 if exists(select 1 from public.outcomes where id=session_id and actor_id=actor and household_id=household) then return session_id; end if;
 if jsonb_array_length(changes)=0 or jsonb_array_length(changes)>100 then raise exception 'Invalid ingredient changes.'; end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(changes) x)<>jsonb_array_length(changes) then raise exception 'Duplicate ingredient.'; end if;
 for row_change in select * from jsonb_array_elements(changes) loop
   select * into item from public.inventory where id=(row_change->>'id')::uuid and household_id=household for update;
   if not found or item.deleted or item.version is distinct from (row_change->>'version')::int then raise sqlstate 'PT409' using message='Stock changed. Reload the latest levels and review again.'; end if;
   if (row_change->>'stock')::int > item.stock then raise exception 'Remaining stock cannot increase after cooking.'; end if;
   if not (row_change->>'used')::boolean and not (row_change->>'discarded')::boolean and (row_change->>'stock')::int<>item.stock then raise exception 'Mark use or discard before changing stock.'; end if;
   entries:=entries || jsonb_build_array(jsonb_build_object('id',item.id,'name',item.name,'category',item.category,'used',(row_change->>'used')::boolean,'discarded',(row_change->>'discarded')::boolean,'before_stock',item.stock,'stock',(row_change->>'stock')::int));
   update public.inventory set stock=(row_change->>'stock')::smallint,version=version+1,updated_by=actor,updated_at=now() where id=item.id;
 end loop;
 insert into public.outcomes(id,household_id,actor_id,recipe,ingredients) values(session_id,household,actor,recipe_data,entries);
 insert into public.activity(household_id,actor_id,action,label) values(household,actor,'confirmed_meal',recipe_data->>'name');
 return session_id;
end $$;
