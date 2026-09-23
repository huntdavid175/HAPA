-- =====================================================================================
-- Letting the organiser say which tier to push.
--
-- A pricing table needs one card that stands out, but which one is a commercial decision
-- the organiser makes — not something to derive. Deriving it from sales would read as
-- "most popular" on an event that has sold nothing, and hard-coding the middle tier
-- breaks the moment a fourth is added.
--
-- `badge` is free text rather than an enum so the claim is the organiser's own words.
-- "Most popular" on a tier nobody has bought would be a fabricated claim if this code
-- wrote it; leaving it blank highlights the card without asserting anything.
-- =====================================================================================

alter table public.ticket_tiers
  add column if not exists highlight boolean not null default false,
  add column if not exists badge text;

comment on column public.ticket_tiers.highlight is
  'Draws the eye to one tier in the pricing cards. Visual only — carries no claim.';
comment on column public.ticket_tiers.badge is
  'Optional short label on a highlighted tier, in the organiser''s own words ("Most popular", "Best value"). Null shows no badge.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tiers_badge_short'
      and conrelid = 'public.ticket_tiers'::regclass
  ) then
    -- It sits in a pill beside the tier name; anything longer wraps and breaks the card.
    alter table public.ticket_tiers
      add constraint tiers_badge_short check (badge is null or length(badge) <= 24);
  end if;
end $$;
