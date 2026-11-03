create or replace function private.prune_meal_image_cache()
returns void language plpgsql security definer set search_path = public, private as $$
declare
  row_count integer;
  ready_bytes bigint;
  victim text;
begin
  perform pg_advisory_xact_lock(hashtextextended('useeatnow.meal_image_cache', 0));
  delete from private.meal_image_cache where expires_at < now();
  loop
    select count(*) into row_count from private.meal_image_cache;
    select coalesce(sum(octet_length(image_data)), 0) into ready_bytes
      from private.meal_image_cache where status = 'ready';
    exit when row_count <= 100 and ready_bytes <= 64 * 1024 * 1024;
    select cache_key into victim
      from private.meal_image_cache
      where status in ('ready', 'failed')
         or (status = 'generating' and claimed_at < now() - interval '5 minutes')
      order by updated_at asc, cache_key asc
      limit 1;
    exit when victim is null;
    delete from private.meal_image_cache where cache_key = victim;
  end loop;
end $$;

create or replace function public.claim_meal_image(cache_key text, actor uuid, household uuid, session_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare found private.meal_image_cache%rowtype;
  inserted_count integer;
begin
  perform private.prune_meal_image_cache();
  select * into found from private.meal_image_cache where private.meal_image_cache.cache_key = claim_meal_image.cache_key for update;
  if found.status = 'ready' then return jsonb_build_object('status','ready','image',found.image_data); end if;
  if found.status = 'generating' and found.claimed_at > now() - interval '2 minutes' then return jsonb_build_object('status','pending'); end if;
  if found.cache_key is not null then
    update private.meal_image_cache set household_id=claim_meal_image.household, actor_id=claim_meal_image.actor, session_id=claim_meal_image.session_id, status='generating', image_data=null, media_type=null, claimed_at=now(), updated_at=now(), expires_at=now()+interval '24 hours' where private.meal_image_cache.cache_key=claim_meal_image.cache_key;
    return jsonb_build_object('status','claimed');
  end if;
  if (select count(*) from private.meal_image_cache) >= 100 then
    delete from private.meal_image_cache as victim
      where victim.cache_key = (
        select candidate.cache_key from private.meal_image_cache as candidate
        where status in ('ready', 'failed')
        order by updated_at asc, cache_key asc
        limit 1
      );
    if (select count(*) from private.meal_image_cache) >= 100 then
      return jsonb_build_object('status','pending');
    end if;
  end if;
  insert into private.meal_image_cache(cache_key, household_id, actor_id, session_id, status)
    values (claim_meal_image.cache_key, claim_meal_image.household, claim_meal_image.actor, claim_meal_image.session_id, 'generating')
    on conflict on constraint meal_image_cache_pkey do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 1 then return jsonb_build_object('status','claimed'); end if;
  if inserted_count = 0 then
    select * into found from private.meal_image_cache where private.meal_image_cache.cache_key = claim_meal_image.cache_key for update;
    if found.status = 'ready' then return jsonb_build_object('status','ready','image',found.image_data); end if;
    return jsonb_build_object('status','pending');
  end if;
  return jsonb_build_object('status','claimed');
end $$;

create or replace function public.complete_meal_image(cache_key text, image_data text, media_type text)
returns void language plpgsql security definer set search_path = public, private as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('useeatnow.meal_image_cache', 0));
  update private.meal_image_cache set status='ready', image_data=complete_meal_image.image_data, media_type=complete_meal_image.media_type, updated_at=now(), expires_at=now()+interval '24 hours' where private.meal_image_cache.cache_key=complete_meal_image.cache_key;
  perform private.prune_meal_image_cache();
end $$;

create or replace function public.fail_meal_image(cache_key text)
returns void language sql security definer set search_path = public, private as $$
  update private.meal_image_cache set status='failed', updated_at=now(), expires_at=now()+interval '10 minutes' where private.meal_image_cache.cache_key=fail_meal_image.cache_key;
$$;

revoke all on function private.prune_meal_image_cache() from public, anon, authenticated;
revoke all on function public.claim_meal_image(text, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_meal_image(text, text, text) from public, anon, authenticated;
revoke all on function public.fail_meal_image(text) from public, anon, authenticated;
grant execute on function public.claim_meal_image(text, uuid, uuid, uuid) to service_role;
grant execute on function public.complete_meal_image(text, text, text) to service_role;
grant execute on function public.fail_meal_image(text) to service_role;

alter table private.meal_image_cache alter column expires_at set default (now() + interval '24 hours');
