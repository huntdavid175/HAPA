# HAPA — event ticketing

Sell tickets to an event in Ghana. A buyer scans a QR or opens a link, picks a ticket
tier, pays with mobile money or card, and gets their ticket on WhatsApp and SMS — nothing
printed. A private dashboard tracks sales, messages ticket holders, and runs the gate on
event night.

Built for one organizer running one event at a time.

## Stack

| | |
|---|---|
| Next.js 16 (App Router) | React 19.2, Node 20.9+ |
| Supabase | Postgres, Auth, RLS, Cron |
| Paystack | Ghana — mobile money (MTN, Telecel, AirtelTigo) + cards |
| Moolre | SMS, sender IDs, WhatsApp |
| Vercel | hosting |

> **Note:** this version uses `proxy.ts`, not `middleware.ts` — renamed in Next.js 16 —
> and `params` / `searchParams` / `cookies()` / `headers()` are all async.

## Status

**Working:** public event page · admin dashboard (sales, buyers, CSV export) · event and
tier management · staff accounts · broadcasts with an outbox worker · share kit (link, QR,
ready-made post) · gate scanner with atomic check-in · buyer ticket page.

**Not built yet:** checkout and the Paystack webhook (deferred until Ghana business
verification completes) and the Moolre messaging adapter (their API contract has not been
confirmed — the stub provider records messages without sending).

See [`plan.md`](plan.md) for the full checklist.

## Running locally

```bash
npm install
cp .env.example .env.local     # then fill in real values
npm run seed                   # admin + staff users, one event, three tiers
npm run dev
```

The seed prints generated passwords once. They are not stored anywhere.

### Environment

Every variable is validated at boot by [`lib/env.ts`](lib/env.ts) — a missing or malformed
value crashes the server immediately rather than failing at checkout. Supabase keys must
be the current `sb_publishable_…` / `sb_secret_…` format; the legacy `anon` and
`service_role` JWTs are rejected on purpose.

Paystack keys are **optional** while payments are deferred. `requirePaystack()` throws at
the boundary if any checkout path runs without them.

## Checks

```bash
npm run check           # everything below, in order
npm run typecheck
npm run check:datetime  # venue-time ⇄ UTC round-trips, incl. DST and half-hour offsets
npm run check:auth      # role split — signs in for real and drives every route
npm run check:broadcast # audience fan-out, idempotency, worker drain
npm run check:gate      # check-in, including 10 concurrent scans of one ticket
```

`check:auth` needs `CHECK_ADMIN_PASSWORD` and `CHECK_STAFF_PASSWORD`. The suites that
touch data seed their own rows and clean up after themselves, but they run against the
**linked Supabase project** — do not point them at production once it holds real buyers.

## Design decisions worth knowing before you change things

- **Money is integer pesewas everywhere.** `GH₵50.00` is `5000`. Never floats.
- **Overselling is prevented in the database,** not in application code — two serverless
  invocations can race, so availability is computed under a row lock.
- **Only the webhook may issue tickets.** The post-payment redirect verifies for fast
  feedback but grants nothing, so a buyer who closes their browser mid-mobile-money still
  gets their ticket.
- **Single-use check-in is a database guarantee.** `check_in_ticket()` takes
  `SELECT … FOR UPDATE`, so the same forwarded QR at two doors admits exactly one person.
- **Door staff have no access to orders or tickets at all.** The gate lookup returns only
  name, tier, code and status. It must not become a buyer list.
- **Route handlers are not covered by layouts.** `/admin/buyers/export` and
  `/admin/share/qr` each re-check the role themselves; without that, the CSV would be an
  open endpoint.
- **`proxy.ts` is not the security boundary.** It bounces signed-out visitors and nothing
  more — real authorization is `requireAdmin()` / `requireStaffOrAdmin()` in `lib/auth.ts`.
- **A ticket's `code` and `qr_token` are different values.** The code is short and read
  aloud at the gate; the token authorizes the ticket URL and must not be derivable from it.

## Database

Migrations live in `supabase/migrations/` and are applied with:

```bash
npx supabase db push --linked
npx supabase db advisors --linked   # run after every schema change
npx supabase gen types typescript --linked --schema public > lib/database.types.ts
```

RLS is enabled on every table. `anon` can read `events` and `ticket_tiers` and nothing
else, including via default privileges for tables added later.

## Deploying

1. Push to GitHub and import the project in Vercel.
2. Set the environment variables from `.env.example` in the Vercel project.
3. Set `NEXT_PUBLIC_SITE_URL` to the real domain — the QR code encodes it, so a
   `localhost` value produces posters nobody can scan. The app warns you about this on
   the Share page.

### Scheduling (one-time, after the first deploy)

The delivery worker runs on **Supabase Cron**, not Vercel Cron: Vercel's Hobby plan caps
cron at once per day and only guarantees the hour, which is useless for an outbox.
pg_cron ships on Supabase's free plan and schedules to the minute.

The schedule is already created by migration. It reads its configuration from Supabase
Vault and quietly does nothing until you set it, so run this once after deploying:

```sql
select vault.create_secret('<your CRON_SECRET>', 'cron_secret');
select vault.create_secret('https://your-app.vercel.app', 'app_base_url');
```

The secret must match `CRON_SECRET` in the Vercel environment exactly — Vault is the
sender, the app is the receiver. A mismatch means every tick gets a 404 and the outbox
silently stops draining.

Check it is working — **but note what this does and does not tell you**:

```sql
select status, return_message, start_time
from cron.job_run_details order by start_time desc limit 5;
```

`succeeded` only means the SQL function returned without error, and that includes its
"nothing to do" path. A completely broken HTTP call still shows green here. To see whether
the app was actually reached:

```sql
select status_code, left(content, 120) as body, created
from net._http_response order by created desc limit 5;
```

An empty result with a non-empty queue means the call is not going out. A `308` means the
base URL has a trailing slash — pg_net does not follow redirects.

A dropped tick loses nothing — every message's state and backoff is a row in
`message_deliveries`, so the next minute claims the same work. The queue is the source of
truth; the schedule is only a nudge.

## Before the first real event

- Complete Paystack Ghana business verification — it gates the launch date more than any
  code does.
- Register an alphanumeric SMS Sender ID (days of lead time in Ghana).
- Submit WhatsApp templates for ticket delivery, reminders and time changes. WhatsApp does
  not permit free-form business-initiated messages; broadcasts are SMS-first for that
  reason.
- Scan a printed QR with a real phone before printing at volume.
- Rehearse the gate on site. The scanner is online-only and tickets are links, so event
  night depends on venue signal twice over. The short code in every message is the
  fallback.
