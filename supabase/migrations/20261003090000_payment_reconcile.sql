-- =====================================================================================
-- Payment reconciliation: catch Moolre payments that never sent a callback.
--
-- Found in production on 3 Oct 2026: during a Moolre outage a buyer paid GH₵1, the money
-- left their phone, Moolre's status endpoint later reported the payment successful — and
-- Moolre never called our webhook, then or after. The order sat pending, its hold lapsed,
-- and no ticket was issued. Nothing on our side could notice.
--
-- So the app now asks Moolre itself. Every two minutes this job wakes
-- /api/cron/reconcile when some order is due a check; the route asks Moolre about each
-- one and settles any that are paid through exactly the same code as the webhook (status
-- lookup, exact amount, issue, queue delivery — all idempotent). The webhook stays the
-- fast path; this is the safety net.
--
-- Backoff, so abandoned checkouts are not asked about forever:
--   first 30 minutes  every ~4 minutes  (mobile money confirming late)
--   up to 6 hours     every 30 minutes  (an outage like the one above)
--   up to 48 hours    every 3 hours     (a long outage)
--   after that        never
-- `failed` orders are skipped: that status means the payment link was never created, so
-- there is nothing at Moolre to ask about.
-- =====================================================================================

alter table public.orders
  add column payment_checked_at timestamptz;

comment on column public.orders.payment_checked_at is
  'When reconciliation last asked Moolre about this order. Drives its backoff.';

-- -------------------------------------------------------------------------------------
-- The orders due a check now, least recently checked first.
-- -------------------------------------------------------------------------------------
create or replace function public.payment_reconcile_candidates(p_limit integer default 25)
returns table (id uuid, reference text, total_pesewas integer, currency text)
language sql
stable
security invoker
set search_path = ''
as $$
  select o.id, o.paystack_reference, o.total_pesewas, o.currency
  from public.orders o
  where o.status in ('pending', 'expired')
    -- Younger than this, the callback is most likely still on its way.
    and o.created_at < now() - interval '2 minutes'
    and o.created_at > now() - interval '48 hours'
    and (
      o.payment_checked_at is null
      or o.payment_checked_at < now() - case
           when o.created_at > now() - interval '30 minutes' then interval '4 minutes'
           when o.created_at > now() - interval '6 hours' then interval '30 minutes'
           else interval '3 hours'
         end
    )
  order by o.payment_checked_at nulls first, o.created_at
  limit greatest(p_limit, 0);
$$;

revoke execute on function public.payment_reconcile_candidates(integer) from public, anon, authenticated;
grant execute on function public.payment_reconcile_candidates(integer) to service_role;

-- Backs the candidate scan; there are few unsettled orders, but this keeps it from
-- reading every paid one.
create index if not exists orders_unsettled_created_idx
  on public.orders (created_at)
  where status in ('pending', 'expired');

-- -------------------------------------------------------------------------------------
-- Wake the app when there is something to check. Same shape and same Vault secrets as
-- private.invoke_delivery_worker (see 20260922202559_normalize_cron_base_url.sql).
-- -------------------------------------------------------------------------------------
create or replace function private.invoke_payment_reconcile()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'app_base_url';

  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'cron_secret';

  if v_url is null or v_secret is null then
    return;
  end if;

  v_url := rtrim(btrim(v_url), '/');

  if v_url like '%localhost%' or v_url like '%127.0.0.1%' then
    return;
  end if;

  -- Only wake the app when some order is due a check.
  if not exists (select 1 from public.payment_reconcile_candidates(1)) then
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/api/cron/reconcile',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || v_secret
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$$;

revoke execute on function private.invoke_payment_reconcile() from public;

do $$
begin
  perform cron.unschedule('reconcile-payments');
exception
  when others then null; -- not scheduled yet
end;
$$;

select cron.schedule(
  'reconcile-payments',
  '*/2 * * * *',
  $$ select private.invoke_payment_reconcile(); $$
);
