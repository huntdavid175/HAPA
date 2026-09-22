-- =====================================================================================
-- Fixes for everything `supabase db advisors` flagged after the initial schema.
--
--   1. function_search_path_mutable — three functions had a role-mutable search_path
--   2. anon_security_definer_function_executable — handle_new_user() was a SECURITY
--      DEFINER function sitting in the exposed schema, callable over /rest/v1/rpc
--   3. multiple_permissive_policies — events, ticket_tiers and profiles each evaluated
--      three SELECT policies per query for signed-in users
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- 1. Pin search_path on the remaining public functions.
--
-- Every identifier inside these bodies is either in pg_catalog (always resolvable) or
-- already schema-qualified, so an empty search_path changes nothing except closing the
-- hijacking vector. CREATE OR REPLACE preserves the OIDs, so the column DEFAULTs on
-- public.tickets that call these keep working.
-- -------------------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.generate_ticket_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  result text := '';
  i integer;
begin
  for i in 1..7 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return substr(result, 1, 3) || '-' || substr(result, 4, 4);
end;
$$;

create or replace function public.generate_qr_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select replace(replace(replace(encode(extensions.gen_random_bytes(24), 'base64'), '+', '-'), '/', '_'), '=', '');
$$;

-- -------------------------------------------------------------------------------------
-- 2. Move the auth trigger function out of the exposed schema.
--
-- `public.handle_new_user()` was reachable at /rest/v1/rpc/handle_new_user for both anon
-- and authenticated. A direct call would error out for lack of a trigger record, but a
-- SECURITY DEFINER function has no business being a public API endpoint at all.
-- -------------------------------------------------------------------------------------

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    -- NOTE: raw_user_meta_data is user-editable, so this is only safe because public
    -- signup is disabled — the sole way a user is created is an admin doing it.
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'staff')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

drop function if exists public.handle_new_user();

-- -------------------------------------------------------------------------------------
-- 3. Collapse overlapping SELECT policies.
--
-- Postgres ORs every permissive policy together and evaluates each one per query, so
-- three SELECT policies meant three evaluations — including a is_admin() lookup — on
-- every read. The access model is unchanged; it is now expressed in one policy per role.
--
-- The `for all` admin policies are split into explicit insert/update/delete so they stop
-- contributing a fourth SELECT policy.
-- -------------------------------------------------------------------------------------

-- events ----------------------------------------------------------------------------
drop policy "published events are public"     on public.events;
drop policy "signed-in staff read all events" on public.events;
drop policy "admins manage events"            on public.events;

-- Anonymous buyers: published (or closed) events only. Drafts stay invisible.
create policy "anon reads live events"
  on public.events for select
  to anon
  using (status in ('published', 'sales_closed'));

-- Any signed-in user is either staff or admin, so one predicate covers both.
create policy "staff read all events"
  on public.events for select
  to authenticated
  using (private.is_staff_or_admin());

create policy "admins insert events"
  on public.events for insert to authenticated with check (private.is_admin());
create policy "admins update events"
  on public.events for update to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy "admins delete events"
  on public.events for delete to authenticated using (private.is_admin());

-- ticket_tiers ----------------------------------------------------------------------
drop policy "tiers of visible events are public" on public.ticket_tiers;
drop policy "signed-in staff read all tiers"     on public.ticket_tiers;
drop policy "admins manage tiers"                on public.ticket_tiers;

create policy "anon reads live tiers"
  on public.ticket_tiers for select
  to anon
  using (
    active and exists (
      select 1 from public.events e
      where e.id = ticket_tiers.event_id and e.status in ('published', 'sales_closed')
    )
  );

create policy "staff read all tiers"
  on public.ticket_tiers for select
  to authenticated
  using (private.is_staff_or_admin());

create policy "admins insert tiers"
  on public.ticket_tiers for insert to authenticated with check (private.is_admin());
create policy "admins update tiers"
  on public.ticket_tiers for update to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy "admins delete tiers"
  on public.ticket_tiers for delete to authenticated using (private.is_admin());

-- profiles --------------------------------------------------------------------------
drop policy "own profile readable"    on public.profiles;
drop policy "admins read all profiles" on public.profiles;
drop policy "admins manage profiles"   on public.profiles;

-- One policy: you can always see yourself; admins can see everyone.
create policy "read own profile or all as admin"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()) or private.is_admin());

create policy "admins insert profiles"
  on public.profiles for insert to authenticated with check (private.is_admin());
create policy "admins update profiles"
  on public.profiles for update to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy "admins delete profiles"
  on public.profiles for delete to authenticated using (private.is_admin());
