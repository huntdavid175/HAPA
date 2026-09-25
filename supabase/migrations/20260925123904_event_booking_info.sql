-- =====================================================================================
-- Bookings and contact details, shown under the ticket cards.
--
-- Organisers publish a block of phone numbers, an email and a website for table bookings
-- and questions — the text they already circulate on WhatsApp. Like `description` it is
-- rich text, sanitised against the same allowlist in the save action (lib/rich-text.ts)
-- before it is stored, so the public page renders it without cleaning it again.
--
-- Empty string rather than null, matching `description`: blank means "show nothing".
-- =====================================================================================

alter table public.events
  add column if not exists booking_info text not null default '';

comment on column public.events.booking_info is
  'Sanitised rich text shown under the ticket cards: bookings, reservations, contacts.';
