-- =====================================================================================
-- Door registrations.
--
-- Guests fill in a form on their own phone as they arrive, one form per night
-- (`/register/day-1` … `day-3`). The nights are fixed config in lib/registration-days.ts,
-- not rows in `events`, so `day` is the night's number rather than a foreign key.
--
-- Written only by the server action (app/register/actions.ts) with the secret key, which
-- bypasses RLS. Guests are anonymous and `anon` gets no grant here at all — a public
-- insert policy would let anyone script rows in straight through PostgREST, skipping the
-- validation. Admins read them; the rows are personal data, so door staff do not.
-- =====================================================================================

create table public.registrations (
  id                 uuid primary key default gen_random_uuid(),
  day                smallint not null check (day between 1 and 3),
  first_name         text not null check (length(btrim(first_name)) between 1 and 80),
  last_name          text not null check (length(btrim(last_name)) between 1 and 80),
  email              text not null check (length(email) <= 254 and email like '%_@_%._%'),
  -- E.164. Ghanaian numbers are normalised to +233…; the diaspora night brings foreign
  -- numbers, which are kept as typed with their country code.
  phone              text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  occupation         text not null check (length(btrim(occupation)) between 1 and 120),
  -- Mirrors HEARD_ABOUT_OPTIONS. A fixed list so the answers can be counted.
  heard_about        text not null check (heard_about in (
                       'Instagram', 'TikTok', 'X (Twitter)', 'Facebook', 'WhatsApp',
                       'Friend or family', 'Poster or flyer', 'Radio or TV', 'Other'
                     )),
  -- Free text, only with "Other", and optional even then.
  heard_about_other  text check (
                       heard_about_other is null
                       or (heard_about = 'Other' and length(heard_about_other) <= 200)
                     ),
  created_at         timestamptz not null default now()
);

comment on table public.registrations is
  'Guests who registered at the door, one row per guest per night.';

-- One registration per email per night. A guest who taps Register twice, or fills the
-- form in again because the first attempt looked stuck, is the same guest — the action
-- treats the conflict as "already registered", not as an error. Lowercased because
-- phones autocapitalise the first letter.
create unique index registrations_day_email_key
  on public.registrations (day, lower(email));

-- The admin list: one night, newest first.
create index registrations_day_created_idx
  on public.registrations (day, created_at desc);

alter table public.registrations enable row level security;

-- Default privileges already strip `anon` from new tables (…_tighten_anon_grants); said
-- again here so this table does not depend on that migration having run first.
revoke all on public.registrations from anon;

create policy "admins read registrations"
  on public.registrations for select
  to authenticated
  using (private.is_admin());

create policy "admins delete registrations"
  on public.registrations for delete
  to authenticated
  using (private.is_admin());
