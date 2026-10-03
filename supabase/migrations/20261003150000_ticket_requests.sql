-- =====================================================================================
-- Ticket requests: tiers booked through the organiser instead of paid online.
--
-- Moolre settles cedis only, so a tier priced in another currency — the US$10,000
-- corporate table — cannot go through checkout. Its card opens a request form instead;
-- each submission lands here and is emailed to the organiser, who arranges the rest
-- (app/requests/actions.ts, the Ticket requests page in the admin).
--
-- Like registrations: written only by the server action with the secret key, which
-- bypasses RLS. `anon` gets no grant at all — a public insert policy would let anyone
-- script requests in through PostgREST, skipping the validation. Admins read them and
-- mark them handled.
-- =====================================================================================

create table public.ticket_requests (
  id                 uuid primary key default gen_random_uuid(),
  event_id           uuid not null references public.events (id) on delete cascade,
  -- The tier is kept as a snapshot as well as a key: a request is a record of what was
  -- asked for, and a tier can be renamed or deleted afterwards.
  tier_id            uuid references public.ticket_tiers (id) on delete set null,
  tier_name          text not null,
  quantity           smallint not null check (quantity between 1 and 20),
  buyer_name         text not null check (length(btrim(buyer_name)) between 2 and 120),
  buyer_email        text not null check (length(buyer_email) <= 254 and buyer_email like '%_@_%._%'),
  -- E.164; corporate buyers are often abroad, so any country code is accepted.
  buyer_phone        text not null check (buyer_phone ~ '^\+[1-9][0-9]{7,14}$'),
  organisation       text check (organisation is null or length(btrim(organisation)) between 1 and 160),
  message            text check (message is null or length(message) <= 1000),
  -- The same list as registrations and orders (HEARD_ABOUT_OPTIONS).
  heard_about        text not null check (heard_about in (
                       'Instagram', 'TikTok', 'X (Twitter)', 'Facebook', 'WhatsApp',
                       'Friend or family', 'Poster or flyer', 'Radio or TV', 'Other'
                     )),
  heard_about_other  text check (
                       heard_about_other is null
                       or (heard_about = 'Other' and length(heard_about_other) <= 200)
                     ),
  status             text not null default 'new' check (status in ('new', 'handled')),
  handled_at         timestamptz,
  created_at         timestamptz not null default now(),

  constraint ticket_requests_handled_has_time check ((status = 'handled') = (handled_at is not null))
);

comment on table public.ticket_requests is
  'Requests for tiers booked through the organiser rather than paid online.';

-- The admin list: new first, newest first.
create index ticket_requests_status_created_idx
  on public.ticket_requests (status, created_at desc);

alter table public.ticket_requests enable row level security;

revoke all on public.ticket_requests from anon;

create policy "admins read ticket requests"
  on public.ticket_requests for select
  to authenticated
  using (private.is_admin());

create policy "admins update ticket requests"
  on public.ticket_requests for update
  to authenticated
  using (private.is_admin())
  with check (private.is_admin());
