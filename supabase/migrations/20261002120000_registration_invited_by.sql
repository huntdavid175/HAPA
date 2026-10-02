-- =====================================================================================
-- Door registrations: "Invited by".
--
-- Optional free text — the name of whoever invited the guest, as they typed it. Null when
-- they leave it blank; never an empty string (the action stores blank as null), which the
-- check enforces so "not answered" has one spelling.
--
-- Additive and nullable: existing rows read as not answered, and code that does not know
-- the column keeps working, so this can be applied before the code that writes it.
-- =====================================================================================

alter table public.registrations
  add column invited_by text check (
    invited_by is null or length(btrim(invited_by)) between 1 and 120
  );

comment on column public.registrations.invited_by is
  'Who invited the guest, as they typed it. Optional; null when left blank.';
