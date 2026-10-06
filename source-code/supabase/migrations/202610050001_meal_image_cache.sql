create table if not exists private.meal_image_cache (
  cache_key text primary key check (cache_key ~ '^[0-9a-f]{64}$'),
  household_id uuid not null references public.households(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  session_id uuid not null,
  status text not null check (status in ('generating', 'ready', 'failed')),
  image_data text,
  media_type text,
  claimed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  check (image_data is null or octet_length(image_data) <= 8 * 1024 * 1024),
  check (status <> 'ready' or (image_data is not null and media_type is not null))
);

create index if not exists meal_image_cache_expiry_idx on private.meal_image_cache (expires_at);
revoke all on private.meal_image_cache from public, anon, authenticated;

create or replace function public.claim_meal_image(cache_key text, actor uuid, household uuid, session_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private as $$
declare found private.meal_image_cache%rowtype;
  inserted_count integer;
begin
  delete from private.meal_image_cache where expires_at < now();
  insert into private.meal_image_cache(cache_key, household_id, actor_id, session_id, status)
    values (claim_meal_image.cache_key, claim_meal_image.household, claim_meal_image.actor, claim_meal_image.session_id, 'generating')
    on conflict on constraint meal_image_cache_pkey do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count = 1 then return jsonb_build_object('status','claimed'); end if;
  select * into found from private.meal_image_cache where private.meal_image_cache.cache_key = claim_meal_image.cache_key for update;
  if found.status = 'ready' then return jsonb_build_object('status','ready','image',found.image_data); end if;
  if found.status = 'generating' and found.claimed_at > now() - interval '2 minutes' then return jsonb_build_object('status','pending'); end if;
  update private.meal_image_cache set household_id=claim_meal_image.household, actor_id=claim_meal_image.actor, session_id=claim_meal_image.session_id, status='generating', image_data=null, media_type=null, claimed_at=now(), updated_at=now(), expires_at=now()+interval '7 days' where private.meal_image_cache.cache_key=claim_meal_image.cache_key;
  return jsonb_build_object('status','claimed');
end $$;

create or replace function public.complete_meal_image(cache_key text, image_data text, media_type text)
returns void language sql security definer set search_path = public, private as $$
  update private.meal_image_cache set status='ready', image_data=complete_meal_image.image_data, media_type=complete_meal_image.media_type, updated_at=now(), expires_at=now()+interval '24 hours' where private.meal_image_cache.cache_key=complete_meal_image.cache_key;
$$;

create or replace function public.fail_meal_image(cache_key text)
returns void language sql security definer set search_path = public, private as $$
  update private.meal_image_cache set status='failed', updated_at=now(), expires_at=now()+interval '10 minutes' where private.meal_image_cache.cache_key=fail_meal_image.cache_key;
$$;

revoke all on function public.claim_meal_image(text, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_meal_image(text, text, text) from public, anon, authenticated;
revoke all on function public.fail_meal_image(text) from public, anon, authenticated;
grant execute on function public.claim_meal_image(text, uuid, uuid, uuid) to service_role;
grant execute on function public.complete_meal_image(text, text, text) to service_role;
grant execute on function public.fail_meal_image(text) to service_role;
