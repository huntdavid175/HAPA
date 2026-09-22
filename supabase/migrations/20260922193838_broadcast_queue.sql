-- =====================================================================================
-- Broadcast queueing and the outbox worker's claim.
--
-- Both live in SQL because both need guarantees the client library cannot express:
-- an atomic insert-select for fan-out, and FOR UPDATE SKIP LOCKED so two concurrent
-- workers never send the same message twice.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- Fan a broadcast out into the outbox.
--
-- One row per (paid order × channel). Keyed on the ORDER, not the ticket: someone who
-- bought four tickets is one person and gets one message, not four.
--
-- Idempotent — re-running for the same broadcast inserts nothing further, so a retried
-- request cannot double-send to five thousand people.
-- -------------------------------------------------------------------------------------
create or replace function public.enqueue_broadcast(p_broadcast_id uuid)
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_broadcast public.broadcasts;
  v_channel   public.delivery_channel;
  v_tier      uuid;
  v_checked   boolean;
  v_inserted  integer := 0;
  v_rows      integer;
begin
  select * into v_broadcast from public.broadcasts where id = p_broadcast_id;
  if not found then
    raise exception 'Broadcast % not found', p_broadcast_id;
  end if;

  -- Guard against a double submit re-queueing the whole audience.
  if exists (select 1 from public.message_deliveries where broadcast_id = p_broadcast_id) then
    return 0;
  end if;

  v_tier    := nullif(v_broadcast.audience_filter ->> 'tier_id', '')::uuid;
  v_checked := (v_broadcast.audience_filter ->> 'checked_in')::boolean;

  foreach v_channel in array v_broadcast.channels loop
    insert into public.message_deliveries
      (broadcast_id, order_id, channel, recipient, body, status, next_attempt_at)
    select
      p_broadcast_id,
      o.id,
      v_channel,
      case when v_channel = 'email' then o.buyer_email else o.buyer_phone end,
      v_broadcast.body,
      'queued',
      now()
    from public.orders o
    where o.event_id = v_broadcast.event_id
      and o.status = 'paid'
      -- Tier filter: did this order include the tier in question?
      and (
        v_tier is null
        or exists (
          select 1 from public.order_items oi
          where oi.order_id = o.id and oi.tier_id = v_tier
        )
      )
      -- Check-in filter: "has at least one ticket checked in", or the inverse.
      and (
        v_checked is null
        or v_checked = exists (
          select 1 from public.tickets t
          where t.order_id = o.id and t.status = 'checked_in'
        )
      )
      -- Voided-only orders should not be messaged about an event they no longer attend.
      and exists (
        select 1 from public.tickets t
        where t.order_id = o.id and t.status <> 'void'
      );

    get diagnostics v_rows = row_count;
    v_inserted := v_inserted + v_rows;
  end loop;

  update public.broadcasts
  set status = 'queued', recipient_count = v_inserted
  where id = p_broadcast_id;

  return v_inserted;
end;
$$;

revoke execute on function public.enqueue_broadcast(uuid) from public;
grant execute on function public.enqueue_broadcast(uuid) to authenticated, service_role;

-- -------------------------------------------------------------------------------------
-- The worker's claim.
--
-- SKIP LOCKED is what makes this safe to run concurrently: overlapping cron invocations
-- (or a retry firing while the previous run is still going) each take a different slice
-- instead of blocking on, or duplicating, the same rows.
--
-- Marking 'sending' and incrementing attempts inside the same statement means a worker
-- that dies mid-send leaves an honest record rather than a row that looks untouched.
-- -------------------------------------------------------------------------------------
create or replace function public.claim_message_deliveries(p_limit integer default 50)
returns setof public.message_deliveries
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  return query
  update public.message_deliveries d
  set status = 'sending',
      attempts = d.attempts + 1,
      last_attempt_at = now()
  where d.id in (
    select d2.id
    from public.message_deliveries d2
    where d2.status in ('queued', 'failed')
      and d2.next_attempt_at <= now()
      -- Give up after 5 tries; the failure dashboard surfaces these for manual resend.
      and d2.attempts < 5
    order by d2.next_attempt_at
    for update skip locked
    limit greatest(p_limit, 1)
  )
  returning d.*;
end;
$$;

revoke execute on function public.claim_message_deliveries(integer) from public;
grant execute on function public.claim_message_deliveries(integer) to service_role;

-- -------------------------------------------------------------------------------------
-- Roll per-delivery outcomes up onto the broadcast so the UI can show progress.
-- -------------------------------------------------------------------------------------
create or replace function public.refresh_broadcast_counts(p_broadcast_id uuid)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  update public.broadcasts b
  set sent_count   = counts.sent,
      failed_count = counts.failed,
      status = case
        when counts.pending > 0 then 'sending'::public.broadcast_status
        when counts.sent = 0 and counts.failed > 0 then 'failed'::public.broadcast_status
        else 'sent'::public.broadcast_status
      end,
      sent_at = case when counts.pending = 0 then coalesce(b.sent_at, now()) else b.sent_at end
  from (
    select
      count(*) filter (where status in ('sent', 'delivered'))            as sent,
      count(*) filter (where status = 'failed' and attempts >= 5)        as failed,
      count(*) filter (where status in ('queued', 'sending')
                          or (status = 'failed' and attempts < 5))       as pending
    from public.message_deliveries
    where broadcast_id = p_broadcast_id
  ) counts
  where b.id = p_broadcast_id;
$$;

revoke execute on function public.refresh_broadcast_counts(uuid) from public;
grant execute on function public.refresh_broadcast_counts(uuid) to authenticated, service_role;
