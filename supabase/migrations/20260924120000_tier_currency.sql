-- =====================================================================================
-- A currency per tier.
--
-- Some tiers are sold in cedis and some in dollars (exhibition booths and corporate
-- tables are usually quoted in USD). The currency belongs to the tier, and each order
-- records the one it was charged in, so changing a tier later never rewrites what a
-- past buyer paid.
--
-- Amounts stay integer minor units: pesewas for GHS, cents for USD. Both are 1/100, and
-- Paystack takes the minor unit for both, so nothing converts. The `_pesewas` column
-- names predate this and are read as "minor units of the row's currency".
--
-- One currency per order. Paystack charges a single currency per transaction, so a
-- mixed cart cannot be paid in one go — reserve_tickets refuses it rather than trusting
-- the page to have prevented it.
-- =====================================================================================

alter table public.ticket_tiers
  add column if not exists currency text not null default 'GHS';

alter table public.orders
  add column if not exists currency text not null default 'GHS';

comment on column public.ticket_tiers.currency is
  'ISO 4217 code the tier is priced in. price_pesewas is in this currency''s minor unit.';
comment on column public.orders.currency is
  'Currency the order was charged in, snapshotted from its tiers. total_pesewas is in this currency''s minor unit.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tiers_currency_supported'
      and conrelid = 'public.ticket_tiers'::regclass
  ) then
    -- Only what Paystack Ghana settles. Widening this is a decision, not a typo fix.
    alter table public.ticket_tiers
      add constraint tiers_currency_supported check (currency in ('GHS', 'USD'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'orders_currency_supported'
      and conrelid = 'public.orders'::regclass
  ) then
    alter table public.orders
      add constraint orders_currency_supported check (currency in ('GHS', 'USD'));
  end if;
end $$;

-- -------------------------------------------------------------------------------------
-- reserve_tickets, now currency-aware.
--
-- Unchanged apart from three things: every tier in the order must share a currency, the
-- order records it, and it is returned so the caller charges Paystack in the currency
-- the database decided rather than one the browser claimed.
--
-- The return type changes, which `create or replace` cannot do, hence the drop. The
-- migration runs in one transaction, so there is no moment without the function.
-- -------------------------------------------------------------------------------------
drop function if exists public.reserve_tickets(uuid, jsonb, text, text, text, text, text, integer);

create function public.reserve_tickets(
  p_event_id     uuid,
  p_items        jsonb,
  p_buyer_name   text,
  p_buyer_phone  text,
  p_buyer_email  text,
  p_reference    text,
  p_ip_hash      text default null,
  p_hold_minutes integer default 10
)
returns table (order_id uuid, total_pesewas integer, currency text)
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
  v_currency  text;
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

    if v_currency is null then
      v_currency := v_tier.currency;
    elsif v_currency <> v_tier.currency then
      raise exception 'Tickets priced in % and % have to be bought in separate orders',
        v_currency, v_tier.currency using errcode = 'check_violation';
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
    total_pesewas, currency, status, paystack_reference, hold_expires_at, ip_hash
  )
  values (
    p_event_id, p_buyer_name, p_buyer_phone, p_buyer_email,
    v_total, v_currency, 'pending', p_reference,
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

  return query select v_order, v_total, v_currency;
end;
$$;

-- Supabase's default privileges grant execute on new functions to anon and authenticated
-- by name, which `from public` does not undo. Checkout calls this with the secret key
-- only; a browser holding the publishable key must not be able to open holds directly.
revoke execute on function public.reserve_tickets(uuid, jsonb, text, text, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.reserve_tickets(uuid, jsonb, text, text, text, text, text, integer) to service_role;
