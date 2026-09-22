-- =====================================================================================
-- The gate.
--
-- Both functions are SECURITY INVOKER and granted only to service_role. Door staff have
-- no RLS access to tickets or orders at all — the server action checks the caller's role
-- first and then acts under the secret key. That keeps authorization in application code
-- where it is explicit, instead of adding a SECURITY DEFINER function to the exposed
-- schema that anyone signed in could call directly.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- Check a ticket in. This is the single-use guarantee.
--
-- SELECT ... FOR UPDATE locks the row for the duration of the transaction, so two staff
-- scanning the same forwarded QR at two doors at the same instant cannot both succeed:
-- the second waits, then reads status = 'checked_in' and is told it is already used.
-- A UI-level check could not make that promise.
--
-- Accepts either the opaque qr_token (from a scan) or the short human code (typed when
-- the buyer's phone has no signal).
-- -------------------------------------------------------------------------------------
create or replace function public.check_in_ticket(
  p_lookup text,
  p_staff  uuid default null
)
returns table (
  outcome       text,
  ticket_code   text,
  buyer_name    text,
  tier_name     text,
  checked_in_at timestamptz
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_id      uuid;
  v_status  public.ticket_status;
  v_when    timestamptz;
  v_code    text;
  v_buyer   text;
  v_tier    text;
begin
  select t.id, t.status, t.checked_in_at, t.code, o.buyer_name, tt.name
    into v_id, v_status, v_when, v_code, v_buyer, v_tier
  from public.tickets t
  join public.orders o       on o.id  = t.order_id
  join public.ticket_tiers tt on tt.id = t.tier_id
  where t.qr_token = p_lookup
     or upper(t.code) = upper(btrim(p_lookup))
  for update of t;

  if not found then
    return query select 'not_found'::text, null::text, null::text, null::text, null::timestamptz;
    return;
  end if;

  if v_status = 'void' then
    return query select 'void'::text, v_code, v_buyer, v_tier, null::timestamptz;
    return;
  end if;

  if v_status = 'checked_in' then
    return query select 'already_used'::text, v_code, v_buyer, v_tier, v_when;
    return;
  end if;

  update public.tickets
  set status = 'checked_in',
      checked_in_at = now(),
      checked_in_by = p_staff
  where id = v_id;

  return query select 'valid'::text, v_code, v_buyer, v_tier, now();
end;
$$;

revoke execute on function public.check_in_ticket(text, uuid) from public;
grant execute on function public.check_in_ticket(text, uuid) to service_role;

-- -------------------------------------------------------------------------------------
-- Gate lookup, for when a buyer cannot show a scannable ticket.
--
-- Returns only what someone on the door needs to admit a person: name, tier, ticket code
-- and status. Deliberately NOT the phone number, email or what they paid — door staff get
-- no buyer list, and this must not become one. Capped at 10 results so it cannot be used
-- to page through the whole event.
-- -------------------------------------------------------------------------------------
create or replace function public.lookup_tickets(
  p_event uuid,
  p_query text
)
returns table (
  ticket_id     uuid,
  ticket_code   text,
  buyer_name    text,
  tier_name     text,
  status        public.ticket_status,
  checked_in_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.id, t.code, o.buyer_name, tt.name, t.status, t.checked_in_at
  from public.tickets t
  join public.orders o        on o.id  = t.order_id
  join public.ticket_tiers tt on tt.id = t.tier_id
  where t.event_id = p_event
    and o.status = 'paid'
    and (
      upper(t.code) = upper(btrim(p_query))
      or o.buyer_name ilike '%' || p_query || '%'
    )
  order by o.buyer_name, t.code
  limit 10;
$$;

revoke execute on function public.lookup_tickets(uuid, text) from public;
grant execute on function public.lookup_tickets(uuid, text) to service_role;

-- Gate lookup searches by buyer name on every miss at the door; without this it is a
-- sequential scan over every order for the event.
create index if not exists orders_buyer_name_trgm_idx
  on public.orders (lower(buyer_name) text_pattern_ops);
