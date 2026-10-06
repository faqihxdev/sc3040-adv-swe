begin;
delete from private.ai_calls;
delete from private.meal_image_cache;
do $$
declare
  actor_id uuid := gen_random_uuid();
  household_id uuid := gen_random_uuid();
  session_id uuid := gen_random_uuid();
  key text := repeat('a', 64);
  result jsonb;
  failed boolean;
  i integer;
begin
  insert into auth.users(id, email) values (actor_id, actor_id::text || '@tests.invalid');
  insert into public.households(id, owner_id, name) values (household_id, actor_id, 'Image cache test');

  result := public.claim_meal_image(key, actor_id, household_id, session_id);
  assert result->>'status' = 'claimed', 'First claim must reserve generation';
  result := public.claim_meal_image(key, actor_id, household_id, session_id);
  assert result->>'status' = 'pending', 'Concurrent claim must not spend twice';

  perform public.complete_meal_image(key, 'data:image/webp;base64,aGVsbG8=', 'image/webp');
  result := public.claim_meal_image(key, actor_id, household_id, session_id);
  assert result->>'status' = 'ready', 'Completed image must be reusable';
  assert result->>'image' = 'data:image/webp;base64,aGVsbG8=', 'Cached image mismatch';

  perform public.fail_meal_image(key);
  result := public.claim_meal_image(key, actor_id, household_id, session_id);
  assert result->>'status' = 'claimed', 'Failed claim must be reclaimable';

  for i in 1..101 loop
    key := repeat(md5('row-' || i::text), 2);
    result := public.claim_meal_image(key, actor_id, household_id, gen_random_uuid());
    if result->>'status' = 'claimed' then
      perform public.complete_meal_image(key, 'tiny', 'image/webp');
    end if;
  end loop;
  assert (select count(*) from private.meal_image_cache) <= 100, 'Cache row bound exceeded';
  key := repeat(md5('row-102'), 2);
  result := public.claim_meal_image(key, actor_id, household_id, gen_random_uuid());
  assert result->>'status' = 'claimed', 'Evictable cache row must make room for a new claim';

  for i in 1..33 loop
    key := repeat(md5('bytes-' || i::text), 2);
    result := public.claim_meal_image(key, actor_id, household_id, gen_random_uuid());
    if result->>'status' = 'claimed' then
      perform public.complete_meal_image(key, repeat('x', 2 * 1024 * 1024), 'image/webp');
    end if;
  end loop;
  assert (select coalesce(sum(octet_length(image_data)), 0) from private.meal_image_cache where status='ready') <= 64 * 1024 * 1024, 'Cache byte bound exceeded';

  -- Interactive calls keep the actor cooldown. Image claims do not.
  result := public.claim_meal_image(repeat(md5('quota-image-1'), 2), actor_id, household_id, gen_random_uuid());
  assert result->>'status' = 'claimed', 'First quota image claim missing';
  assert public.reserve_meal_image(actor_id, 100, repeat(md5('quota-image-1'), 2)) is not null, 'First image reservation missing';
  result := public.claim_meal_image(repeat(md5('quota-image-2'), 2), actor_id, household_id, gen_random_uuid());
  assert result->>'status' = 'claimed', 'Second quota image claim missing';
  assert public.reserve_meal_image(actor_id, 100, repeat(md5('quota-image-2'), 2)) is not null, 'Second image reservation missing';
  result := public.claim_meal_image(repeat(md5('quota-image-3'), 2), actor_id, household_id, gen_random_uuid());
  assert result->>'status' = 'claimed', 'Third quota image claim missing';
  assert public.reserve_meal_image(actor_id, 100, repeat(md5('quota-image-3'), 2)) is not null, 'Third image reservation missing';

  result := public.claim_meal_image(repeat(md5('quota-interactive'), 2), actor_id, household_id, gen_random_uuid());
  assert result->>'status' = 'claimed', 'Interactive quota claim missing';
  assert public.reserve_ai(actor_id, 100) is not null, 'Interactive reservation missing';
  failed := false;
  begin perform public.reserve_ai(actor_id, 100); exception when sqlstate 'PT429' then failed := true; end;
  assert failed, 'Interactive cooldown was not enforced';

  for i in 1..96 loop
    key := repeat(md5('quota-fill-' || i::text), 2);
    result := public.claim_meal_image(key, actor_id, household_id, gen_random_uuid());
    assert result->>'status' = 'claimed', 'Global quota fill claim missing';
    assert public.reserve_meal_image(actor_id, 100, key) is not null, 'Image reservation should ignore actor cooldown';
    perform public.complete_meal_image(key, 'tiny', 'image/webp');
  end loop;
  key := repeat(md5('quota-overflow'), 2);
  result := public.claim_meal_image(key, actor_id, household_id, gen_random_uuid());
  assert result->>'status' = 'claimed', 'Global quota overflow claim missing';
  failed := false;
  begin perform public.reserve_meal_image(actor_id, 100, key); exception when sqlstate 'PT429' then failed := true; end;
  assert failed, 'Global quota was not enforced for image reservations';
  assert not has_function_privilege('anon','public.reserve_meal_image(uuid,integer,text)','execute'), 'Anon can reserve image quota';
  assert not has_function_privilege('authenticated','public.reserve_meal_image(uuid,integer,text)','execute'), 'Authenticated user can reserve image quota';
end $$;
rollback;
