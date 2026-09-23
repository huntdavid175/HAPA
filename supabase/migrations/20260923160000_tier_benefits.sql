-- =====================================================================================
-- What each ticket actually gets you.
--
-- `description` is one line of prose and cannot answer the question a buyer is really
-- asking when Early Bird is GH₵35 and VIP is GH₵200: what is the difference. A list of
-- short benefit lines renders the same way in every tier, so the eye compares down a
-- column instead of reading three paragraphs.
--
-- `text[]` rather than jsonb: these are ordered short strings with no keys, nothing is
-- ever queried *inside* them, and an array keeps the admin form a plain list of lines.
--
-- No new RLS policy is needed. Policies are row-level, and `anon` already selects
-- ticket_tiers for published events, so this column is readable on the public page the
-- moment it exists — which is the point.
-- =====================================================================================

alter table public.ticket_tiers
  add column if not exists benefits text[] not null default '{}'::text[];

comment on column public.ticket_tiers.benefits is
  'Short "what you get" lines shown under the tier name on the public page. Ordered; kept deliberately few so tiers stay comparable at a glance.';

-- A cap, not a style guide: without one a single tier could carry hundreds of lines and
-- push the buy button off the page. Per-line length is enforced in the admin form, where
-- a rejected value can explain itself.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tiers_benefits_count'
      and conrelid = 'public.ticket_tiers'::regclass
  ) then
    alter table public.ticket_tiers
      add constraint tiers_benefits_count check (cardinality(benefits) <= 8);
  end if;
end $$;
