-- =====================================================================================
-- Scheduling, moved from Vercel Cron to Supabase Cron.
--
-- Vercel's Hobby plan caps cron at once per day and only guarantees the hour, which is
-- unusable for an outbox worker. pg_cron ships enabled on Supabase's free plan and
-- schedules to the minute, so the schedule now lives next to the data it drains.
--
-- pg_net is fire-and-forget: a non-2xx is not retried and only lands in
-- net._http_response. That is acceptable here precisely because nothing lives in the
-- tick — every message's state, attempt count and backoff is a row in
-- message_deliveries. A dropped minute means the next minute claims the same rows.
-- The queue is the source of truth; the schedule is only a nudge.
--
-- The secret and base URL are read from Supabase Vault at call time, so neither is
-- written into this migration or committed to the repo. Set them with:
--
--   select vault.create_secret('<your CRON_SECRET>', 'cron_secret');
--   select vault.create_secret('https://your-app.vercel.app', 'app_base_url');
-- =====================================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- -------------------------------------------------------------------------------------
-- Ask the app to drain a batch of the outbox.
--
-- Lives in `private` so it is not callable over the Data API — it carries the cron
-- secret, and an exposed version would let anyone trigger sends.
--
-- No-ops quietly when the secrets are absent or still point at localhost, so the schedule
-- can exist before the app is deployed without erroring every single minute.
-- -------------------------------------------------------------------------------------
create or replace function private.invoke_delivery_worker()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
  v_queued integer;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'app_base_url';

  select decrypted_secret into v_secret
  from vault.decrypted_secrets where name = 'cron_secret';

  if v_url is null or v_secret is null then
    return;
  end if;

  -- A localhost URL is unreachable from Supabase's network; skip rather than pile up
  -- failed requests in net._http_response.
  if v_url like '%localhost%' or v_url like '%127.0.0.1%' then
    return;
  end if;

  -- Only wake the app when there is something to do. The worker is harmless to call on
  -- an empty queue, but at one call per minute forever there is no reason to spend the
  -- function invocation.
  select count(*) into v_queued
  from public.message_deliveries
  where status in ('queued', 'failed')
    and next_attempt_at <= now()
    and attempts < 5;

  if v_queued = 0 then
    return;
  end if;

  perform net.http_post(
    url     := v_url || '/api/cron/deliver',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || v_secret
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end;
$$;

revoke execute on function private.invoke_delivery_worker() from public;

-- -------------------------------------------------------------------------------------
-- Every minute. Re-running this migration replaces the job rather than duplicating it.
-- -------------------------------------------------------------------------------------
do $$
begin
  perform cron.unschedule('deliver-messages');
exception
  when others then null; -- not scheduled yet
end;
$$;

select cron.schedule(
  'deliver-messages',
  '* * * * *',
  $$ select private.invoke_delivery_worker(); $$
);
