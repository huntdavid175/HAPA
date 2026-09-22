-- =====================================================================================
-- Remaining stock per tier.
--
-- available = capacity − issued tickets − live holds
--
-- A "live hold" is a pending order whose hold_expires_at is still in the future. Once it
-- lapses the stock is available again, without anything having to clean up first — the
-- sweeper job only tidies row state, it is not what makes stock reappear.
--
-- SECURITY INVOKER on purpose. It reads `tickets` and `orders`, which anon cannot see, so
-- it runs with the caller's own privileges and EXECUTE is granted only to the roles that
-- legitimately read those tables. The public event page calls it server-side under the
-- secret key; RLS remains the thing that decides which *events* are visible at all.
--
-- This is a read-only estimate for display. It is NOT what prevents overselling — that is
-- the row-locking reserve function in the checkout phase. Two readers can see the same
-- "3 left" at the same time and that is fine.
-- =====================================================================================

create or replace function public.tier_availability(p_event_id uuid)
returns table (
  tier_id   uuid,
  capacity  integer,
  sold      integer,
  held      integer,
  available integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    t.id,
    t.capacity,
    coalesce(s.sold, 0),
    coalesce(h.held, 0),
    greatest(t.capacity - coalesce(s.sold, 0) - coalesce(h.held, 0), 0)
  from public.ticket_tiers t
  left join lateral (
    -- Voided tickets free their seat back up; checked-in ones obviously do not.
    select count(*)::integer as sold
    from public.tickets tk
    where tk.tier_id = t.id
      and tk.status in ('issued', 'checked_in')
  ) s on true
  left join lateral (
    select coalesce(sum(oi.quantity), 0)::integer as held
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where oi.tier_id = t.id
      and o.status = 'pending'
      and o.hold_expires_at > now()
  ) h on true
  where t.event_id = p_event_id;
$$;

revoke execute on function public.tier_availability(uuid) from public;
grant execute on function public.tier_availability(uuid) to authenticated, service_role;
