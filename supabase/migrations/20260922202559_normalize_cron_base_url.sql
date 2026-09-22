-- =====================================================================================
-- Harden the cron invoker against a trailing slash in app_base_url.
--
-- Found in production: the Vault secret was stored as "https://…vercel.app/", so the
-- function built "https://…vercel.app//api/cron/deliver". Next.js answers that with a
-- 308 redirect to the single-slash path, and pg_net does not follow redirects — so every
-- tick would have been swallowed silently, with cron.job_run_details still reporting
-- "succeeded" because the SQL function itself never errored.
--
-- Normalising here rather than only correcting the stored value: whoever sets this next
-- will paste a URL from a browser address bar, which is where the trailing slash came
-- from in the first place.
-- =====================================================================================

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

  -- Trim whitespace and any trailing slashes before appending the path.
  v_url := rtrim(btrim(v_url), '/');

  if v_url like '%localhost%' or v_url like '%127.0.0.1%' then
    return;
  end if;

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

-- Correct the value that is already stored, so this does not depend on anyone re-running
-- the setup step.
do $$
declare
  v_id uuid;
  v_value text;
begin
  select id, decrypted_secret into v_id, v_value
  from vault.decrypted_secrets where name = 'app_base_url';

  if v_id is not null and v_value <> rtrim(btrim(v_value), '/') then
    perform vault.update_secret(v_id, rtrim(btrim(v_value), '/'));
  end if;
end;
$$;
