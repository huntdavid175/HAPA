-- =====================================================================================
-- Ticket buyers: "How did you hear about the event?", as door registration asks.
--
-- The same fixed list as registrations.heard_about (HEARD_ABOUT_OPTIONS in
-- lib/registration-days.ts), so the two sets of answers can be counted side by side.
-- Change the list in all three places together.
--
-- Nullable: orders placed before this have no answer. The checkout form requires one,
-- and startCheckout writes it straight after reserve_tickets creates the order — which
-- keeps reserve_tickets' signature (and the overselling logic in it) untouched.
-- =====================================================================================

alter table public.orders
  add column heard_about text check (heard_about is null or heard_about in (
    'Instagram', 'TikTok', 'X (Twitter)', 'Facebook', 'WhatsApp',
    'Friend or family', 'Poster or flyer', 'Radio or TV', 'Other'
  )),
  -- Free text, only with "Other", and optional even then.
  add column heard_about_other text check (
    heard_about_other is null
    or (heard_about = 'Other' and length(heard_about_other) <= 200)
  );

comment on column public.orders.heard_about is
  'How the buyer heard about the event, from the fixed list. Null on orders before Oct 2026.';
