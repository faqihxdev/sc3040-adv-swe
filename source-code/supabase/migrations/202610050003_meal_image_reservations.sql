alter table private.ai_calls
  add column if not exists purpose text not null default 'interactive'
  check (purpose in ('interactive', 'meal_image'));

create or replace function public.reserve_ai(actor uuid, request_limit int) returns uuid
language plpgsql security definer set search_path='' as $$
declare call_id uuid;
begin
 perform pg_advisory_xact_lock(90403040);
 if (select count(*) from private.ai_calls) >= least(greatest(request_limit,0),100) then
   raise sqlstate 'PT429' using message='Development AI call limit reached.';
 end if;
 if exists(select 1 from private.ai_calls where actor_id=actor and purpose='interactive' and created_at>now()-interval '10 seconds') then
   raise sqlstate 'PT429' using message='Wait a few seconds before requesting again.';
 end if;
 insert into private.ai_calls(actor_id,purpose) values(actor,'interactive') returning id into call_id;
 return call_id;
end $$;

create or replace function public.reserve_meal_image(actor uuid, request_limit int, cache_key text) returns uuid
language plpgsql security definer set search_path='' as $$
declare call_id uuid;
begin
 perform pg_advisory_xact_lock(90403040);
 if not exists (
   select 1 from private.meal_image_cache
   where meal_image_cache.cache_key=reserve_meal_image.cache_key
     and meal_image_cache.actor_id=reserve_meal_image.actor
     and meal_image_cache.status='generating'
     and meal_image_cache.claimed_at>now()-interval '2 minutes'
 ) then
   raise sqlstate 'PT409' using message='Image generation claim is no longer available.';
 end if;
 if (select count(*) from private.ai_calls) >= least(greatest(request_limit,0),100) then
   raise sqlstate 'PT429' using message='Development AI call limit reached.';
 end if;
 insert into private.ai_calls(actor_id,purpose) values(actor,'meal_image') returning id into call_id;
 return call_id;
end $$;

revoke all on function public.reserve_ai(uuid,int) from public, anon, authenticated;
revoke all on function public.reserve_meal_image(uuid,int,text) from public, anon, authenticated;
grant execute on function public.reserve_ai(uuid,int) to service_role;
grant execute on function public.reserve_meal_image(uuid,int,text) to service_role;
