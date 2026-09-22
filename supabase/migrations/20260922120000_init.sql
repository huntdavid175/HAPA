-- =====================================================================================
-- Event ticketing platform — initial schema
--
-- Design rules enforced here rather than in application code:
--   * Money is integer pesewas. GHS 50.00 = 5000. There are no floats anywhere.
--   * Prices are snapshotted onto order_items, so editing a tier never rewrites history.
--   * One ticket row = one admission = one scan.
--   * `code` (typed by door staff) and `qr_token` (authorizes a URL) are separate values
--     with different threat models: the code is short and guessable-ish, the token is not.
--   * Only one event may be published at a time.
--   * RLS is on for every table. Buyers are anonymous and never touch these tables
--     directly — checkout and the Paystack webhook run with the Supabase secret key
--     (which authenticates as the `service_role` Postgres role and bypasses RLS).
-- =====================================================================================

-- Supabase installs extensions into the `extensions` schema, not `public`, so calls to
-- pgcrypto functions below must be schema-qualified.
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------------

create type public.user_role       as enum ('admin', 'staff');
create type public.event_status    as enum ('draft', 'published', 'sales_closed', 'archived');
create type public.order_status    as enum ('pending', 'paid', 'failed', 'expired');
create type public.ticket_status   as enum ('issued', 'checked_in', 'void');
create type public.delivery_channel as enum ('sms', 'whatsapp', 'email');
create type public.delivery_status  as enum ('queued', 'sending', 'sent', 'delivered', 'failed');
create type public.broadcast_status as enum ('draft', 'queued', 'sending', 'sent', 'failed');

-- ---------------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------------

create schema if not exists private;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------------
-- profiles — one row per auth user, created by trigger. Public signup is disabled in
-- Supabase Auth, so rows only appear when an admin creates a staff account.
-- ---------------------------------------------------------------------------------

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        public.user_role not null default 'staff',
  full_name   text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
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
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'staff')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Role lookups must be SECURITY DEFINER: a policy on `profiles` that queries `profiles`
-- would recurse infinitely.
--
-- They live in `private`, NOT `public`: PostgREST only exposes configured schemas, and a
-- SECURITY DEFINER function in an exposed schema is a callable API endpoint running with
-- its owner's privileges. search_path is pinned to defeat search_path hijacking, and each
-- function checks auth.uid() internally so it can only ever answer about its own caller.

create or replace function private.current_role_is(target public.user_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = target
  );
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_role_is('admin');
$$;

-- Admins can do everything staff can, so "is staff" means "is signed in with any role".
create or replace function private.is_staff_or_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = (select auth.uid())
  );
$$;

-- Postgres grants EXECUTE to PUBLIC on every new function, so revoke first and then grant
-- back only to the role that actually needs it. `anon` never evaluates a policy that calls
-- these, because every such policy is scoped with TO authenticated.
revoke execute on function private.current_role_is(public.user_role) from public;
revoke execute on function private.is_admin() from public;
revoke execute on function private.is_staff_or_admin() from public;

grant usage on schema private to authenticated;
grant execute on function private.current_role_is(public.user_role) to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_staff_or_admin() to authenticated;

-- ---------------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------------

create table public.events (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  description   text not null default '',
  venue         text not null default '',
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  timezone      text not null default 'Africa/Accra',
  cover_image   text,
  currency      text not null default 'GHS',
  status        public.event_status not null default 'draft',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint events_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint events_ends_after_starts check (ends_at is null or ends_at > starts_at)
);

-- The site root resolves "the" event, so exactly one may be published.
create unique index events_one_published on public.events ((true)) where status = 'published';

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------
-- ticket_tiers
-- ---------------------------------------------------------------------------------

create table public.ticket_tiers (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events (id) on delete cascade,
  name           text not null,
  description    text not null default '',
  price_pesewas  integer not null,
  capacity       integer not null,
  sales_start    timestamptz,
  sales_end      timestamptz,
  position       integer not null default 0,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Free tiers are out of scope for v1: a 0 price would skip Paystack entirely and the
  -- whole issuance path assumes a completed charge.
  constraint tiers_price_positive check (price_pesewas > 0),
  constraint tiers_capacity_positive check (capacity > 0),
  constraint tiers_sales_window check (sales_end is null or sales_start is null or sales_end > sales_start),
  unique (event_id, name)
);

create index ticket_tiers_event_idx on public.ticket_tiers (event_id, position);

create trigger ticket_tiers_set_updated_at
  before update on public.ticket_tiers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------
-- orders
--
-- `hold_expires_at` is the inventory hold. A pending order whose hold is still in the
-- future counts against tier capacity; once it lapses the stock returns to the pool.
-- ---------------------------------------------------------------------------------

create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  event_id            uuid not null references public.events (id) on delete restrict,
  buyer_name          text not null,
  buyer_phone         text not null,
  buyer_email         text not null,
  total_pesewas       integer not null,
  status              public.order_status not null default 'pending',
  paystack_reference  text not null unique,
  paystack_channel    text,
  paid_at             timestamptz,
  hold_expires_at     timestamptz not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint orders_total_positive check (total_pesewas > 0),
  -- Normalized to E.164 at the application edge; rejected here if that ever regresses,
  -- because an unsendable number means a paying customer with no ticket.
  constraint orders_phone_e164 check (buyer_phone ~ '^\+[1-9][0-9]{7,14}$'),
  constraint orders_email_format check (buyer_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint orders_paid_has_timestamp check ((status = 'paid') = (paid_at is not null))
);

create index orders_event_status_idx on public.orders (event_id, status, created_at desc);
-- Drives the hold-expiry sweeper.
create index orders_pending_holds_idx on public.orders (hold_expires_at) where status = 'pending';
create index orders_phone_idx on public.orders (buyer_phone);

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------
-- order_items
-- ---------------------------------------------------------------------------------

create table public.order_items (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders (id) on delete cascade,
  tier_id             uuid not null references public.ticket_tiers (id) on delete restrict,
  quantity            integer not null,
  -- Snapshot. Changing a tier price must never alter what a past buyer was charged.
  unit_price_pesewas  integer not null,
  created_at          timestamptz not null default now(),

  constraint order_items_quantity_positive check (quantity > 0 and quantity <= 20),
  constraint order_items_price_positive check (unit_price_pesewas > 0),
  unique (order_id, tier_id)
);

create index order_items_order_idx on public.order_items (order_id);
create index order_items_tier_idx on public.order_items (tier_id);

-- ---------------------------------------------------------------------------------
-- tickets — one row per admission
-- ---------------------------------------------------------------------------------

-- Ambiguity-free alphabet: no 0/O, no 1/I/L. Door staff read these aloud in a loud venue.
create or replace function public.generate_ticket_code()
returns text
language plpgsql
volatile
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

-- URL-safe, unguessable. This is what authorizes the ticket page, so it must not be
-- derivable from the short code.
create or replace function public.generate_qr_token()
returns text
language sql
volatile
as $$
  select replace(replace(replace(encode(extensions.gen_random_bytes(24), 'base64'), '+', '-'), '/', '_'), '=', '');
$$;

create table public.tickets (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders (id) on delete cascade,
  tier_id        uuid not null references public.ticket_tiers (id) on delete restrict,
  -- Denormalized from the order so gate queries never need a join.
  event_id       uuid not null references public.events (id) on delete restrict,
  code           text not null unique default public.generate_ticket_code(),
  qr_token       text not null unique default public.generate_qr_token(),
  status         public.ticket_status not null default 'issued',
  checked_in_at  timestamptz,
  checked_in_by  uuid references public.profiles (id) on delete set null,
  void_reason    text,
  refunded_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint tickets_checked_in_consistent check ((status = 'checked_in') = (checked_in_at is not null))
);

create index tickets_order_idx on public.tickets (order_id);
create index tickets_checked_in_by_idx on public.tickets (checked_in_by);
create index tickets_event_status_idx on public.tickets (event_id, status);
create index tickets_tier_idx on public.tickets (tier_id);

create trigger tickets_set_updated_at
  before update on public.tickets
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------
-- broadcasts
-- ---------------------------------------------------------------------------------

create table public.broadcasts (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events (id) on delete cascade,
  channels         public.delivery_channel[] not null,
  subject          text,
  body             text not null,
  -- WhatsApp cannot carry free-form business-initiated messages; when whatsapp is in
  -- `channels` this names the pre-approved Meta template to use.
  whatsapp_template text,
  audience_filter  jsonb not null default '{}'::jsonb,
  status           public.broadcast_status not null default 'draft',
  created_by       uuid references public.profiles (id) on delete set null,
  recipient_count  integer not null default 0,
  sent_count       integer not null default 0,
  failed_count     integer not null default 0,
  sent_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint broadcasts_channels_not_empty check (array_length(channels, 1) > 0),
  constraint broadcasts_whatsapp_needs_template
    check (not ('whatsapp' = any (channels)) or whatsapp_template is not null)
);

create index broadcasts_event_idx on public.broadcasts (event_id, created_at desc);
create index broadcasts_created_by_idx on public.broadcasts (created_by);

create trigger broadcasts_set_updated_at
  before update on public.broadcasts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------
-- message_deliveries — the single outbox for BOTH ticket delivery and broadcasts.
-- One table means one worker, one retry policy, one failure dashboard.
-- ---------------------------------------------------------------------------------

create table public.message_deliveries (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid references public.orders (id) on delete cascade,
  ticket_id            uuid references public.tickets (id) on delete cascade,
  broadcast_id         uuid references public.broadcasts (id) on delete cascade,
  channel              public.delivery_channel not null,
  recipient            text not null,
  body                 text not null,
  provider             text not null default 'stub',
  provider_message_id  text,
  status               public.delivery_status not null default 'queued',
  error                text,
  attempts             integer not null default 0,
  last_attempt_at      timestamptz,
  next_attempt_at      timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- Every message must be traceable to why it was sent.
  constraint deliveries_has_origin check (order_id is not null or broadcast_id is not null)
);

-- The worker's claim query: oldest due work first, skipping rows another worker holds.
create index deliveries_claimable_idx
  on public.message_deliveries (next_attempt_at)
  where status in ('queued', 'failed');
create index deliveries_broadcast_idx on public.message_deliveries (broadcast_id);
create index deliveries_ticket_idx on public.message_deliveries (ticket_id);
create index deliveries_order_idx on public.message_deliveries (order_id);

create trigger message_deliveries_set_updated_at
  before update on public.message_deliveries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------------
-- webhook_events — idempotency guard. Paystack retries, and a duplicate that issued a
-- second set of tickets would be worse than a dropped one.
-- ---------------------------------------------------------------------------------

create table public.webhook_events (
  id                 uuid primary key default gen_random_uuid(),
  provider           text not null,
  provider_event_id  text not null,
  event_type         text,
  payload            jsonb not null,
  processed_at       timestamptz,
  error              text,
  created_at         timestamptz not null default now(),

  unique (provider, provider_event_id)
);

create index webhook_events_unprocessed_idx
  on public.webhook_events (created_at)
  where processed_at is null;

-- =====================================================================================
-- Row Level Security
--
-- Default posture: deny. The Supabase secret key authenticates as `service_role`, which
-- bypasses RLS entirely; that is what checkout, the webhook and the cron workers use.
-- The publishable key authenticates as `anon` — nothing below grants it any write.
-- =====================================================================================

alter table public.profiles           enable row level security;
alter table public.events             enable row level security;
alter table public.ticket_tiers       enable row level security;
alter table public.orders             enable row level security;
alter table public.order_items        enable row level security;
alter table public.tickets            enable row level security;
alter table public.broadcasts         enable row level security;
alter table public.message_deliveries enable row level security;
alter table public.webhook_events     enable row level security;

-- profiles ------------------------------------------------------------------------
create policy "own profile readable"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

create policy "admins read all profiles"
  on public.profiles for select
  to authenticated
  using (private.is_admin());

create policy "admins manage profiles"
  on public.profiles for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- events --------------------------------------------------------------------------
-- Anonymous buyers may see a published event. Drafts stay invisible.
create policy "published events are public"
  on public.events for select
  to anon, authenticated
  using (status in ('published', 'sales_closed'));

create policy "signed-in staff read all events"
  on public.events for select
  to authenticated
  using (private.is_staff_or_admin());

create policy "admins manage events"
  on public.events for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- ticket_tiers --------------------------------------------------------------------
create policy "tiers of visible events are public"
  on public.ticket_tiers for select
  to anon, authenticated
  using (
    active and exists (
      select 1 from public.events e
      where e.id = ticket_tiers.event_id and e.status in ('published', 'sales_closed')
    )
  );

create policy "signed-in staff read all tiers"
  on public.ticket_tiers for select
  to authenticated
  using (private.is_staff_or_admin());

create policy "admins manage tiers"
  on public.ticket_tiers for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- orders / order_items ------------------------------------------------------------
-- Admin-only. Door staff get no buyer list; their lookup goes through a narrow
-- SECURITY DEFINER function added in the gate phase, which returns name + tier + status
-- for a specific search and nothing else.
create policy "admins read orders"
  on public.orders for select
  to authenticated
  using (private.is_admin());

create policy "admins update orders"
  on public.orders for update
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

create policy "admins read order items"
  on public.order_items for select
  to authenticated
  using (private.is_admin());

-- tickets -------------------------------------------------------------------------
create policy "admins read tickets"
  on public.tickets for select
  to authenticated
  using (private.is_admin());

create policy "admins update tickets"
  on public.tickets for update
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- broadcasts ----------------------------------------------------------------------
create policy "admins manage broadcasts"
  on public.broadcasts for all
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());

-- message_deliveries --------------------------------------------------------------
-- Read-only for admins: this is the failure dashboard's data source. Writes are the
-- worker's job, via the secret key.
create policy "admins read deliveries"
  on public.message_deliveries for select
  to authenticated
  using (private.is_admin());

-- webhook_events ------------------------------------------------------------------
create policy "admins read webhook events"
  on public.webhook_events for select
  to authenticated
  using (private.is_admin());

-- =====================================================================================
-- Data API grants
--
-- RLS decides which rows a role may see. It does not decide whether the table is
-- reachable through the Data API in the first place — that is a plain table grant, and
-- new projects do not always add one. Granting broadly here is safe only because every
-- table above has RLS enabled with policies that match the real access model.
-- =====================================================================================

grant usage on schema public to anon, authenticated;

-- Anonymous buyers read the event and its tiers. Nothing else.
grant select on public.events, public.ticket_tiers to anon;

-- Signed-in users: table-level access, narrowed to admins/staff by the policies above.
grant select, insert, update, delete
  on public.events, public.ticket_tiers, public.profiles, public.broadcasts
  to authenticated;
grant select, update on public.orders, public.tickets to authenticated;
grant select on public.order_items, public.message_deliveries, public.webhook_events
  to authenticated;
