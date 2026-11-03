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
  signature text;
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

  for i in 1..101 loop
    key := repeat(md5('quota-fill-' || i::text), 2);
    result := public.claim_meal_image(key, actor_id, household_id, gen_random_uuid());
    assert result->>'status' = 'claimed', 'Image claim missing';
    assert public.reserve_meal_image(actor_id, key) is not null, 'Image reservation should succeed beyond 100 calls';
    perform public.complete_meal_image(key, 'tiny', 'image/webp');
  end loop;
  key := repeat(md5('quota-overflow'), 2);
  result := public.claim_meal_image(key, actor_id, household_id, gen_random_uuid());
  assert result->>'status' = 'claimed', 'Legacy image claim missing';
  assert public.reserve_meal_image(actor_id, 0, key) is not null, 'Legacy request_limit still restricts image generation';
  assert (select count(*) from private.ai_calls) = 106, 'Usage history was lost beyond 100 calls';

  update private.ai_calls set created_at=now()-interval '11 seconds' where purpose='interactive';
  assert public.reserve_ai(actor_id) is not null, 'Interactive generation should succeed beyond 100 calls';
  failed := false;
  begin perform public.reserve_ai(actor_id, 0); exception when sqlstate 'PT429' then failed := true; end;
  assert failed, 'Legacy callers must share the interactive cooldown';
  update private.ai_calls set created_at=now()-interval '11 seconds' where purpose='interactive';
  assert public.reserve_ai(actor_id, 0) is not null, 'Legacy request_limit still restricts interactive generation';
  failed := false;
  begin perform public.reserve_ai(actor_id); exception when sqlstate 'PT429' then failed := true; end;
  assert failed, 'Current callers must share the interactive cooldown';

  failed := false;
  begin perform public.reserve_meal_image(actor_id, repeat('z',64)); exception when sqlstate 'PT409' then failed := true; end;
  assert failed, 'A missing image claim was accepted';
  failed := false;
  begin perform public.reserve_meal_image(gen_random_uuid(), key); exception when sqlstate 'PT409' then failed := true; end;
  assert failed, 'Another actor could reserve the image claim';
  update private.meal_image_cache set claimed_at=now()-interval '3 minutes' where cache_key=key;
  failed := false;
  begin perform public.reserve_meal_image(actor_id, key); exception when sqlstate 'PT409' then failed := true; end;
  assert failed, 'An expired image claim was accepted';

  foreach signature in array array['public.reserve_ai(uuid)','public.reserve_ai(uuid,integer)',
    'public.reserve_meal_image(uuid,text)','public.reserve_meal_image(uuid,integer,text)'] loop
    assert not has_function_privilege('anon',signature,'execute'), 'Anon can reserve AI usage';
    assert not has_function_privilege('authenticated',signature,'execute'), 'Authenticated user can reserve AI usage';
    assert has_function_privilege('service_role',signature,'execute'), 'Server cannot reserve AI usage';
  end loop;
  raise notice 'PASS: image cache bounds, generation beyond 100 calls, legacy RPC compatibility, cooldown, claim ownership/expiry and service-only permissions';
end $$;
rollback;
