-- =====================================================================================
-- Least privilege for the anonymous role.
--
-- Verified against the live API after 0001: an anonymous request to /rest/v1/orders
-- returned `200 []` rather than being refused. No rows leaked — RLS did its job — but a
-- 200 means `anon` still holds table-level SELECT from Supabase's default grants on the
-- public schema. RLS is then the only thing standing between a future permissive policy
-- and the buyer list.
--
-- Buyers are anonymous and never read their own data through the Data API: checkout runs
-- server-side under the secret key, and the ticket page is fetched server-side by its
-- qr_token. So `anon` needs exactly two tables and nothing else.
-- =====================================================================================

revoke all on public.orders             from anon;
revoke all on public.order_items        from anon;
revoke all on public.tickets            from anon;
revoke all on public.profiles           from anon;
revoke all on public.broadcasts         from anon;
revoke all on public.message_deliveries from anon;
revoke all on public.webhook_events     from anon;

-- Read-only, and only the two tables the public event page renders. RLS still narrows
-- these to published events.
revoke all on public.events       from anon;
revoke all on public.ticket_tiers from anon;
grant select on public.events, public.ticket_tiers to anon;

-- Supabase's default privileges would re-grant anon on any table added later, which is
-- exactly the mistake this migration exists to prevent.
alter default privileges in schema public revoke all on tables from anon;
