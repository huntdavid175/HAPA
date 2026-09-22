-- =====================================================================================
-- Checkout: inventory reservation, hold expiry, and ticket issuance.
--
-- This is the file where overselling is prevented and where money turns into tickets.
-- All of it lives in the database because two serverless invocations can race, and an
-- application-level check cannot make these promises.
-- =====================================================================================

-- A late webhook can arrive after a hold lapsed and the last ticket went to someone else.
-- We take the money (it already left the buyer's wallet) and flag the order rather than
-- silently issuing a ticket that does not exist or silently keeping the cash.
alter table public.orders
  add column if not exists needs_refund  boolean not null default false,
  add column if not exists refund_reason text,
  -- Hashed, never the raw address: enough to rate-limit stock holds, not a location log.
  add column if not exists ip_hash       text;

create index if not exists orders_needs_refund_idx
  on public.orders (created_at desc) where needs_refund;

create index if not exists orders_ip_hold_idx
  on public.orders (ip_hash, hold_expires_at) where status = 'pending';

-- -------------------------------------------------------------------------------------
-- Reserve stock and open a pending order.
--
-- The tier rows are locked with FOR UPDATE, ordered by id. The ordering is not cosmetic:
-- two buyers taking the same two tiers in opposite orders would deadlock without it.
--
-- Availability is recomputed inside the lock rather than trusted from a prior read, so
-- the "3 left" a buyer saw on the event page cannot be used to oversell.
-- -------------------------------------------------------------------------------------
create or replace function public.reserve_tickets(
  p_event_id     uuid,
  p_items        jsonb,
  p_buyer_name   text,
  p_buyer_phone  text,
  p_buyer_email  text,
  p_reference    text,
  p_ip_hash      text default null,
  p_hold_minutes integer default 10
)
returns table (order_id uuid, total_pesewas integer)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_item      jsonb;
  v_tier      public.ticket_tiers;
  v_qty       integer;
  v_available integer;
  v_total     integer := 0;
  v_order     uuid;
  v_holds     integer;
begin
  if jsonb_array_length(p_items) = 0 then
    raise exception 'Choose at least one ticket' using errcode = 'check_violation';
  end if;

  -- Abuse guard. Without this, a script can open checkouts in a loop and freeze every
  -- ticket for ten minutes at a time without ever paying.
  select count(*) into v_holds
  from public.orders
  where status = 'pending'
    and hold_expires_at > now()
    and (buyer_phone = p_buyer_phone or (p_ip_hash is not null and ip_hash = p_ip_hash));

  if v_holds >= 3 then
    raise exception 'You already have tickets held. Finish or cancel that payment first.'
      using errcode = 'check_violation';
  end if;

  -- Deterministic lock order prevents deadlocks between concurrent multi-tier checkouts.
  for v_tier in
    select t.*
    from public.ticket_tiers t
    where t.id in (
      select (value ->> 'tier_id')::uuid from jsonb_array_elements(p_items)
    )
    order by t.id
    for update
  loop
    select (value ->> 'quantity')::integer into v_qty
    from jsonb_array_elements(p_items)
    where (value ->> 'tier_id')::uuid = v_tier.id;

    if v_tier.event_id <> p_event_id then
      raise exception 'That ticket type is not part of this event' using errcode = 'check_violation';
    end if;

    if not v_tier.active then
      raise exception '% is no longer on sale', v_tier.name using errcode = 'check_violation';
    end if;

    if v_tier.sales_start is not null and v_tier.sales_start > now() then
      raise exception '% is not on sale yet', v_tier.name using errcode = 'check_violation';
    end if;

    if v_tier.sales_end is not null and v_tier.sales_end < now() then
      raise exception 'Sales for % have closed', v_tier.name using errcode = 'check_violation';
    end if;

    select v_tier.capacity
         - (select count(*) from public.tickets tk
            where tk.tier_id = v_tier.id and tk.status in ('issued', 'checked_in'))
         - (select coalesce(sum(oi.quantity), 0) from public.order_items oi
            join public.orders o on o.id = oi.order_id
            where oi.tier_id = v_tier.id
              and o.status = 'pending'
              and o.hold_expires_at > now())
      into v_available;

    if v_qty > v_available then
      if v_available <= 0 then
        raise exception '% has sold out', v_tier.name using errcode = 'check_violation';
      end if;
      raise exception 'Only % left for %', v_available, v_tier.name using errcode = 'check_violation';
    end if;

    v_total := v_total + (v_tier.price_pesewas * v_qty);
  end loop;

  insert into public.orders (
    event_id, buyer_name, buyer_phone, buyer_email,
    total_pesewas, status, paystack_reference, hold_expires_at, ip_hash
  )
  values (
    p_event_id, p_buyer_name, p_buyer_phone, p_buyer_email,
    v_total, 'pending', p_reference,
    now() + make_interval(mins => p_hold_minutes), p_ip_hash
  )
  returning id into v_order;

  insert into public.order_items (order_id, tier_id, quantity, unit_price_pesewas)
  select
    v_order,
    (value ->> 'tier_id')::uuid,
    (value ->> 'quantity')::integer,
    t.price_pesewas
  from jsonb_array_elements(p_items)
  join public.ticket_tiers t on t.id = (value ->> 'tier_id')::uuid;

  return query select v_order, v_total;
end;
$$;

revoke execute on function public.reserve_tickets(uuid, jsonb, text, text, text, text, text, integer) from public;
grant execute on function public.reserve_tickets(uuid, jsonb, text, text, text, text, text, integer) to service_role;

-- -------------------------------------------------------------------------------------
-- Issue tickets for a paid order. Called only by the verified webhook.
--
-- Idempotent on its own: if tickets already exist for the order it returns their count
-- and changes nothing, so a replayed webhook cannot hand out a second set.
--
-- Re-checks availability, because a hold can lapse while a mobile money payment is still
-- confirming. If the stock is genuinely gone the money has still arrived, so the order is
-- marked needs_refund instead of pretending nothing happened.
-- -------------------------------------------------------------------------------------
create or replace function public.issue_tickets_for_order(
  p_order_id uuid,
  p_channel  text default null
)
returns table (issued integer, shortfall integer)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_order     public.orders;
  v_item      record;
  v_available integer;
  v_issued    integer := 0;
  v_short     integer := 0;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Order % not found', p_order_id;
  end if;

  -- Replayed webhook: tickets already exist, so do nothing further.
  select count(*) into v_issued from public.tickets where order_id = p_order_id;
  if v_issued > 0 then
    return query select v_issued, 0;
    return;
  end if;

  for v_item in
    select oi.tier_id, oi.quantity, t.name
    from public.order_items oi
    join public.ticket_tiers t on t.id = oi.tier_id
    where oi.order_id = p_order_id
    order by oi.tier_id
  loop
    perform 1 from public.ticket_tiers where id = v_item.tier_id for update;

    select tt.capacity
         - (select count(*) from public.tickets tk
            where tk.tier_id = v_item.tier_id and tk.status in ('issued', 'checked_in'))
      into v_available
    from public.ticket_tiers tt where tt.id = v_item.tier_id;

    if v_available >= v_item.quantity then
      insert into public.tickets (order_id, tier_id, event_id)
      select p_order_id, v_item.tier_id, v_order.event_id
      from generate_series(1, v_item.quantity);
      v_issued := v_issued + v_item.quantity;
    else
      -- Issue what is left, flag the remainder.
      if v_available > 0 then
        insert into public.tickets (order_id, tier_id, event_id)
        select p_order_id, v_item.tier_id, v_order.event_id
        from generate_series(1, v_available);
        v_issued := v_issued + v_available;
      end if;
      v_short := v_short + (v_item.quantity - greatest(v_available, 0));
    end if;
  end loop;

  update public.orders
  set status = 'paid',
      paid_at = coalesce(paid_at, now()),
      paystack_channel = coalesce(p_channel, paystack_channel),
      needs_refund = (v_short > 0),
      refund_reason = case
        when v_short > 0
        then v_short || ' ticket(s) could not be issued - sold out while payment was confirming'
        else null
      end
  where id = p_order_id;

  return query select v_issued, v_short;
end;
$$;

revoke execute on function public.issue_tickets_for_order(uuid, text) from public;
grant execute on function public.issue_tickets_for_order(uuid, text) to service_role;

-- -------------------------------------------------------------------------------------
-- Sweep lapsed holds.
--
-- Bookkeeping only: availability already ignores a hold whose hold_expires_at has passed,
-- so stock returns to the pool the moment it lapses, with or without this job. Marking
-- them keeps the buyer list honest and stops pending rows accumulating forever.
--
-- The grace period matters. Mobile money can take 60-120s to confirm, and the webhook may
-- land after the hold nominally expired; expiring too eagerly would race it.
-- -------------------------------------------------------------------------------------
create or replace function public.expire_stale_holds(p_grace_minutes integer default 15)
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.orders
  set status = 'expired'
  where status = 'pending'
    and hold_expires_at < now() - make_interval(mins => p_grace_minutes);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.expire_stale_holds(integer) from public;
grant execute on function public.expire_stale_holds(integer) to service_role;

-- Runs entirely inside the database - no HTTP hop, nothing to misconfigure.
do $$
begin
  perform cron.unschedule('expire-holds');
exception when others then null;
end;
$$;

select cron.schedule(
  'expire-holds',
  '*/5 * * * *',
  $$ select public.expire_stale_holds(); $$
);
