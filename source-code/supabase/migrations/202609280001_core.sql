create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public;

create table public.profiles (
 id uuid primary key references auth.users on delete cascade,
 display_name text not null check(length(display_name) between 1 and 80),
 exclusions text[] not null default '{}'
);
create table public.households (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name)) between 1 and 80),
 owner_id uuid not null references auth.users on delete restrict,
 version int not null default 1,
 locations text[] not null default '{}',
 created_at timestamptz not null default now()
);
create table public.memberships (
 user_id uuid primary key references auth.users on delete cascade,
 household_id uuid not null references public.households on delete cascade,
 joined_at timestamptz not null default now()
);
create index membership_household on public.memberships(household_id);
create table public.inventory (
 id uuid primary key default gen_random_uuid(),
 household_id uuid not null references public.households on delete cascade,
 name text not null check(length(trim(name)) between 1 and 100),
 stock smallint not null check(stock between 0 and 5),
 expiry_date date not null,
 category text not null default '' check(length(category)<=50),
 location text not null default '' check(length(location)<=50),
 version int not null default 1,
 deleted boolean not null default false,
 updated_by uuid references auth.users on delete set null,
 updated_at timestamptz not null default now()
);
create index inventory_household_expiry on public.inventory(household_id, expiry_date);
create table public.activity (
 id bigint generated always as identity primary key,
 household_id uuid not null references public.households on delete cascade,
 actor_id uuid references auth.users on delete set null,
 action text not null,
 item_id uuid references public.inventory on delete cascade,
 label text not null,
 before_state jsonb,
 after_state jsonb,
 created_at timestamptz not null default now()
);
create index activity_household_date on public.activity(household_id, created_at desc);
create table public.outcomes (
 id uuid primary key,
 household_id uuid not null references public.households on delete cascade,
 actor_id uuid references auth.users on delete set null,
 recipe jsonb not null,
 ingredients jsonb not null,
 synthetic boolean not null default false,
 created_at timestamptz not null default now()
);
create index outcome_household_date on public.outcomes(household_id,created_at);
create table private.invites (
 household_id uuid primary key references public.households on delete cascade,
 code_hash text not null unique,
 expires_at timestamptz not null
);
create table private.ai_calls (
 id uuid primary key default gen_random_uuid(), actor_id uuid references auth.users on delete set null,
 created_at timestamptz not null default now(), input_tokens int, output_tokens int
);

create function private.household() returns uuid language sql stable security definer
set search_path='' as $$ select household_id from public.memberships where user_id=auth.uid() $$;
create function private.new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,display_name) values(new.id, left(coalesce(nullif(new.raw_user_meta_data->>'display_name',''),'Member'),80));
 return new;
end $$;
create trigger on_user_created after insert on auth.users for each row execute function private.new_user();

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.memberships enable row level security;
alter table public.inventory enable row level security;
alter table public.activity enable row level security;
alter table public.outcomes enable row level security;
grant usage on schema private to authenticated;
grant execute on function private.household() to authenticated;
create policy profile_read on public.profiles for select to authenticated using (
 id=auth.uid() or id in(select user_id from public.memberships where household_id=private.household())
);
create policy household_read on public.households for select to authenticated using(id=private.household());
create policy members_read on public.memberships for select to authenticated using(household_id=private.household());
create policy inventory_read on public.inventory for select to authenticated using(household_id=private.household());
create policy activity_read on public.activity for select to authenticated using(household_id=private.household());
create policy outcome_read on public.outcomes for select to authenticated using(household_id=private.household());
revoke all on all tables in schema public from anon,authenticated;
grant select on public.profiles,public.households,public.memberships,public.inventory,public.activity,public.outcomes to authenticated;

-- All writes lock the household before checking membership/version. This orders
-- confirmations, ownership changes and inventory edits consistently.
create function public.mutate(command text, payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); hid uuid; h public.households; item public.inventory;
 previous jsonb; updated jsonb; ev public.activity; code text; target uuid;
begin
 if uid is null then raise sqlstate '42501' using message='Sign in to continue.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 if command='preferences' then
   if jsonb_typeof(payload->'exclusions')<>'array' or jsonb_array_length(payload->'exclusions')>30 then
     raise exception 'Invalid exclusions.'; end if;
   if exists(select 1 from jsonb_array_elements_text(payload->'exclusions') x where length(x)>80 or length(trim(x))=0) then
     raise exception 'Invalid exclusions.'; end if;
   update public.profiles set exclusions=array(select distinct trim(x) from jsonb_array_elements_text(payload->'exclusions') x) where id=uid;
   return '{}'::jsonb;
 end if;
 if command='create_household' then
   if exists(select 1 from public.memberships where user_id=uid) then raise exception 'Leave your current household first.'; end if;
   insert into public.households(name,owner_id) values(trim(payload->>'name'),uid) returning id into hid;
   insert into public.memberships(user_id,household_id) values(uid,hid);
   insert into public.activity(household_id,actor_id,action,label) values(hid,uid,command,'Created household');
   return jsonb_build_object('id',hid);
 end if;
 if command='join_household' then
   if exists(select 1 from public.memberships where user_id=uid) then raise exception 'Leave your current household first.'; end if;
   select household_id into hid from private.invites where code_hash=encode(extensions.digest(upper(trim(payload->>'code')),'sha256'),'hex') and expires_at>now();
   if hid is null then raise exception 'Invalid or expired join code.'; end if;
   select * into h from public.households where id=hid for update;
   if not found or not exists(select 1 from private.invites where household_id=hid and code_hash=encode(extensions.digest(upper(trim(payload->>'code')),'sha256'),'hex') and expires_at>now()) then raise exception 'Invalid or expired join code.'; end if;
   insert into public.memberships(user_id,household_id) values(uid,hid);
   update public.households set version=version+1 where id=hid;
   insert into public.activity(household_id,actor_id,action,label) values(hid,uid,command,'Joined household');
   return '{}'::jsonb;
 end if;
 hid:=private.household();
 select * into h from public.households where id=hid for update;
 if not found or not exists(select 1 from public.memberships where user_id=uid and household_id=hid) then
   raise sqlstate '42501' using message='Household access is no longer available.'; end if;
 if command in('add_item','edit_item','remove_item') then
   if command='add_item' then
     if (payload->>'stock')::int not between 1 and 5 then raise exception 'Choose an initial stock level.'; end if;
     insert into public.inventory(household_id,name,stock,expiry_date,category,location,updated_by)
     values(hid,trim(payload->>'name'),(payload->>'stock')::smallint,(payload->>'expiry_date')::date,
       trim(coalesce(payload->>'category','')),trim(coalesce(payload->>'location','')),uid) returning * into item;
   else
     select * into item from public.inventory where id=(payload->>'id')::uuid and household_id=hid for update;
     if not found or item.deleted or item.version is distinct from (payload->>'version')::int then raise sqlstate 'PT409' using message='This item changed. Reload and review it before saving.'; end if;
     previous:=to_jsonb(item);
     if command='remove_item' then
       update public.inventory set deleted=true,version=version+1,updated_by=uid,updated_at=now() where id=item.id returning * into item;
     else
       update public.inventory set name=trim(payload->>'name'),stock=(payload->>'stock')::smallint,
         expiry_date=(payload->>'expiry_date')::date,category=trim(coalesce(payload->>'category','')),
         location=trim(coalesce(payload->>'location','')),version=version+1,updated_by=uid,updated_at=now()
         where id=item.id returning * into item;
     end if;
   end if;
   if item.location<>'' and not(item.location=any(h.locations)) then update public.households set locations=array_append(locations,item.location) where id=hid; end if;
   insert into public.activity(household_id,actor_id,action,item_id,label,before_state,after_state)
     values(hid,uid,command,item.id,item.name,previous,to_jsonb(item));
   return to_jsonb(item);
 elsif command='undo' then
   select * into ev from public.activity where household_id=hid and actor_id=uid and action in('add_item','edit_item','remove_item','undo') order by id desc limit 1;
   if not found or ev.action='undo' then raise exception 'There is no inventory edit to undo.'; end if;
   select * into item from public.inventory where id=ev.item_id for update;
   if item.version is distinct from (ev.after_state->>'version')::int then raise sqlstate 'PT409' using message='A later change prevents undo.'; end if;
   previous:=to_jsonb(item);
   if ev.action='add_item' then
     update public.inventory set deleted=true,version=version+1,updated_at=now(),updated_by=uid where id=item.id returning to_jsonb(inventory.*) into updated;
   else
     update public.inventory set name=ev.before_state->>'name',stock=(ev.before_state->>'stock')::smallint,
       expiry_date=(ev.before_state->>'expiry_date')::date,category=ev.before_state->>'category',location=ev.before_state->>'location',
       deleted=(ev.before_state->>'deleted')::boolean,version=version+1,updated_at=now(),updated_by=uid
       where id=item.id returning to_jsonb(inventory.*) into updated;
   end if;
   insert into public.activity(household_id,actor_id,action,item_id,label,before_state,after_state) values(hid,uid,'undo',item.id,item.name,previous,updated);
 elsif command='invite' then
   if h.owner_id<>uid then raise sqlstate '42501' using message='Only the owner can replace join codes.'; end if;
   code:=upper(encode(extensions.gen_random_bytes(6),'hex'));
   insert into private.invites values(hid,encode(extensions.digest(code,'sha256'),'hex'),now()+interval '7 days')
     on conflict(household_id) do update set code_hash=excluded.code_hash,expires_at=excluded.expires_at;
   return jsonb_build_object('code',code,'expires_at',now()+interval '7 days');
 elsif command in('leave','remove_member','transfer','delete_household') then
   if h.version is distinct from (payload->>'version')::int then raise sqlstate 'PT409' using message='Membership changed. Reload and review.'; end if;
   if command='leave' then
     if h.owner_id=uid then raise exception 'Transfer ownership or delete the household before leaving.'; end if;
     delete from public.memberships where user_id=uid;
   else
     if h.owner_id<>uid then raise sqlstate '42501' using message='Only the household owner can do this.'; end if;
     if command='delete_household' then
       if payload->>'confirmation' is distinct from h.name then raise exception 'Type the household name to confirm.'; end if;
       delete from public.households where id=hid; return '{}'::jsonb;
     end if;
     target:=(payload->>'user_id')::uuid;
     if target=uid or not exists(select 1 from public.memberships where user_id=target and household_id=hid) then raise exception 'Select another current member.'; end if;
     if command='transfer' then update public.households set owner_id=target where id=hid;
     else delete from public.memberships where user_id=target; end if;
   end if;
   update public.households set version=version+1 where id=hid;
   insert into public.activity(household_id,actor_id,action,label) values(hid,uid,command,replace(command,'_',' '));
 else raise exception 'Unknown action.';
 end if;
 return '{}'::jsonb;
end $$;
revoke all on function public.mutate(text,jsonb) from public,anon;
grant execute on function public.mutate(text,jsonb) to authenticated;

-- Server-only RPC: the application verifies a signed, validated recipe first.
create function public.confirm_meal(actor uuid, household uuid, session_id uuid, recipe_data jsonb, changes jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare h public.households; row_change jsonb; item public.inventory; entries jsonb:='[]'::jsonb;
begin
 select * into h from public.households where id=household for update;
 if not found or not exists(select 1 from public.memberships where user_id=actor and household_id=household) then raise sqlstate '42501' using message='Household access is no longer available.'; end if;
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
revoke all on function public.confirm_meal(uuid,uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.confirm_meal(uuid,uuid,uuid,jsonb,jsonb) to service_role;

-- Persistent, atomic request reservation. Restarts cannot reset the call cap.
create function public.reserve_ai(actor uuid, request_limit int) returns uuid language plpgsql security definer set search_path='' as $$
declare call_id uuid;
begin
 perform pg_advisory_xact_lock(90403040);
 if (select count(*) from private.ai_calls)>=least(greatest(request_limit,0),100) then raise sqlstate 'PT429' using message='Development AI call limit reached.'; end if;
 if exists(select 1 from private.ai_calls where actor_id=actor and created_at>now()-interval '10 seconds') then raise sqlstate 'PT429' using message='Wait a few seconds before requesting again.'; end if;
 insert into private.ai_calls(actor_id) values(actor) returning id into call_id; return call_id;
end $$;
revoke all on function public.reserve_ai(uuid,int) from public,anon,authenticated;
grant execute on function public.reserve_ai(uuid,int) to service_role;
create function public.record_ai_usage(call_id uuid, inputs int, outputs int) returns void language sql security definer set search_path='' as $$
 update private.ai_calls set input_tokens=inputs,output_tokens=outputs where id=call_id
$$;
revoke all on function public.record_ai_usage(uuid,int,int) from public,anon,authenticated;
grant execute on function public.record_ai_usage(uuid,int,int) to service_role;
