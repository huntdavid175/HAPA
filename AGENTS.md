<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# HAPA — event ticketing

Single-event ticketing for Ghana. Buyers never sign up; a ticket is an unguessable
`qr_token` in a link sent to the buyer by email (SMS and WhatsApp once Moolre is wired).
Read `plan.md` for where the build is.

## Decisions that are settled — don't relitigate

- Money is **integer minor units** everywhere, never floats. `formatPesewas(amount,
  currency)` is the only place it becomes a string.
- **Each tier has a currency, GHS or USD** (`lib/currency.ts`, mirrored by CHECK
  constraints). `_pesewas` columns hold the minor unit of their row's currency — cents
  for a USD tier — and the names predate the change. Orders snapshot their currency.
- **One currency per order.** Paystack charges one currency per payment, so
  `reserve_tickets` refuses a mixed order and returns the currency to charge; the cart
  asks before switching rather than mixing. Never sum amounts across currencies —
  `formatTotals` shows one total per currency.
- USD checkouts are card only (mobile money is cedis only), and fail at Paystack until
  USD is enabled on the account.
- **Only the Paystack webhook issues tickets and queues their delivery.** The redirect
  callback verifies for UX: mobile money often confirms after the buyer has closed the
  tab. (It also calls `issue_tickets_for_order`, which is idempotent, but it queues no
  message — only the webhook does.)
- **Overselling is prevented in the database** (`reserve_tickets`, row locks in id order),
  not in application code.
- Authorization lives in `lib/auth.ts` (`requireAdmin` / `requireStaffOrAdmin`), called
  from layouts *and* from route handlers. `proxy.ts` is an optimistic redirect only —
  layouts do not wrap route handlers, so a CSV or QR route must re-check the role itself.
- Times are stored UTC and displayed in the **venue's** timezone. `lib/datetime.ts` is the
  single conversion point; forms post `YYYY-MM-DDTHH:mm` and let the server convert.
  `formatRelativeTime` ("12 min ago") also takes the venue timezone for its date fallback.
- **Marketing claims are the organiser's, never the code's.** `ticket_tiers.benefits`,
  `.highlight` and `.badge` are authored in the admin form and nothing derives them.
  "Most popular" computed from sales would be a lie on an event that has sold nothing,
  and hard-coding the middle tier breaks the moment a fourth is added. The same rule
  binds agents: do not write benefit or badge copy onto a **published** event to see how
  it looks — that is live text in front of buyers. Use a draft event.
- **Revenue comes from what buyers paid**, the paid `order_items` at their snapshotted
  `unit_price_pesewas` — never sold × today's price. Test purchases were made at lower
  prices, and the multiplication overstated two tiers by ~GH₵30,000.
- **Destructive actions ask first**, with the safe button focused (`initialFocus` on the
  alert dialog): sign out, remove staff, void a ticket, record a refund, gate sign-out.
  Void and refund also require a reason, which is the only record of why.

## Environment and deployment

- **`NEXT_PUBLIC_SITE_URL` is load-bearing in three places**: the Paystack return URL
  (`checkoutCallbackUrl`), the ticket links in every message
  (`lib/messaging/ticket-message.ts`), and share links and QR codes (`lib/share.ts`).
  Wrong value means buyers get dead links, not a visible error.
- It is `NEXT_PUBLIC_*`, so it is **inlined at build time**. Changing it in Vercel does
  nothing until you redeploy.
- Boot validation only checks the URL's *shape*. `http://localhost:3000` is structurally
  valid, so a production deployment carrying the `.env.example` default passes every
  check and then redirects paying buyers to their own machine. It shipped that way once.
  To confirm production's value, read a recent `message_deliveries.body`: its link is
  built from it.
- Store `PAYSTACK_SECRET_KEY` and `RESEND_API_KEY` as Vercel **Sensitive** variables, not
  plain ones — plain values stay readable in the dashboard and via `vercel env pull`.
- Rotating the Paystack key has an ordering trap: it is also the webhook HMAC-SHA512
  signing key (`lib/paystack.ts`). Paystack signs with the new key the instant you
  generate it, so every signature fails until Vercel is updated **and redeployed**.
  Update `.env.local` too, or `check:paystack` and `check:webhook` fail.
- Server env is validated at boot (`lib/env.ts`), and an **empty** value fails it:
  `RESEND_API_KEY=` is not "unset". Comment a variable out rather than blank it.
- `main` deploys to production on Vercel. Merging is a release.

## Verify by running it, not by reading it

`npm run check` runs everything. Individually: `check:datetime`, `check:phone`,
`check:auth`, `check:broadcast`, `check:gate`, `check:checkout`, `check:webhook`,
`check:orders`, `check:richtext`.

- Most suites need the dev server running and seed data (`npm run seed`).
- `check:auth` needs `CHECK_ADMIN_PASSWORD` / `CHECK_STAFF_PASSWORD`. The seed prints
  passwords once and never stores them — `npm run reset:password` is the recovery path.
  The emails are overridable with `CHECK_ADMIN_EMAIL` / `CHECK_STAFF_EMAIL`.
- `check:webhook` needs `PAYSTACK_SECRET_KEY` set **on the dev server**, not just on the
  script. Without it the route 500s and every assertion fails confusingly.
- `check:checkout` builds its own draft event and tiers and removes them, on success and
  on failure. A multi-row insert through PostgREST sends `null`, not the column default,
  for a key only some rows carry — spell the key out on every row.
- **The Supabase project is production, and the local dev server talks to it.** Seeding
  temporary accounts (`tmp-…@example.com`) and deleting them in a `finally` is the
  established pattern; afterwards, query `auth.users` to prove none are left. Tell the
  user when you create accounts — they show up in the Staff list while they exist.
- Admin pages need a signed-in admin to screenshot. `playwright-core` driving the
  installed Edge (`chromium.launch({ channel: "msedge" })`) works without downloading a
  browser. Screenshot desktop and phone widths, in both colour schemes.
- **To test a form whose submission would reach buyers** (a broadcast, a check-in),
  intercept its POST with `page.route`, read the fields, and `route.abort()` it. Compare
  a database count before and after to prove nothing was written.
- The gate's database answers `not_found` and `already_used` without writing anything, so
  those two results are safe to trigger against live data. A valid scan checks a real
  ticket in — never produce one to test.
- On Windows, Git Bash rewrites an argument like `/admin/buyers` into a Windows path;
  prefix `MSYS_NO_PATHCONV=1`. Stopping the `npm run dev` task can leave the `next`
  process holding port 3000 with stale env — find and stop that PID before restarting.

## The public buy flow

Pricing cards at the foot of the page, a drawer for the cart, and a rail (desktop) or bar
(mobile) that follows the scroll.

- **One source of quantity truth**: the context in `app/_components/cart.tsx`. The cards,
  the rail/bar and the drawer all read it. Adding from a card opens the drawer with the
  tier already in it.
- `bumpQty` derives from the previous state, never from a captured value. Two fast `+`
  taps used to land as one.
- With JS off the CTA is an `<a href="#tickets">` to the cards; the stepper and the
  drawer are `js-only`. The page still sells.
- The rail and bar hide while the cards are in view and return once something is in the
  cart — `use-in-view.ts`, an IntersectionObserver.
- Every card is the same size: `md:auto-rows-fr` makes every row as tall as the tallest
  card, across rows as well as within one. The highlighted tier is marked only by border
  colour — all cards carry `border-4`, the rest `border-transparent` — so it never
  differs in size. A lift, extra padding or a thicker border on one card breaks that.
- Each card is a ticket: body, then a `.plan-tear` perforation, then a stub with the
  price and the action. The stub is one fixed height on every card (button, stepper and
  sold-out label are all `h-13`; scarcity shares the price's line) so the tears line up.
  Anything that adds a line to one stub knocks its tear out of level.
  Heights are deliberately *not* equalised in the single-column mobile layout — each
  card is its own grid row there, and forcing it only adds dead space.
- Prices are set as parts (`formatPesewasParts`): the amount large, the symbol and the
  pesewas small. In the phone bar a full-size "GH₵50,000.00" ran under the button at
  320px. Never let a price wrap.

## The admin

- **Shell** (`app/admin/layout.tsx`): content is capped at `max-w-6xl` and centred;
  the top bar is sticky and names the page (`_components/admin-header.tsx` — keep its
  labels in step with the sidebar's).
- **Page pattern**, borrowed from Shopify: a heading row with the page's actions at the
  right, then `lg:grid-cols-[minmax(0,1fr)_20rem] xl:…_22rem` — what the page is about in
  the wide column, settings and summaries in cards in the narrow one. On a phone the
  columns stack; if something in the side column matters first, render it at the top of
  the main column too, `lg:hidden` there and `hidden lg:block` in the side.
- Lists are lists, not tables, wherever a row is one long sentence plus an action:
  `TableCell` is `whitespace-nowrap`, so long errors ran through neighbouring columns and
  pushed buttons off a phone screen. Whole rows link to their record.
- **Event settings posts from cards that are not inside its form.** Forms cannot nest,
  and the tier list and status buttons are forms of their own, so the `<form>` is empty
  and every field carries `form="event-form"`; `DescriptionEditor` and `ScheduleFields`
  take a `form` prop for their hidden inputs. A field added without it is silently not
  saved. Pending state comes from `useActionState`, since `useFormStatus` only sees a
  form it is rendered inside.
- A Base UI `Select` cannot hold an empty value. Where the action reads blank as "all",
  keep the choice in state and post it through your own hidden input.

## The gate (`/scan`)

- The result takes the whole screen in its colour. **Green clears itself** after 2.5s so a
  moving queue needs no taps; amber (already used) and red (not valid, cancelled) wait
  for "Next guest". While a result shows, the camera stops submitting.
- The check-in count comes from the server (`router.refresh()` after each valid scan and
  when a result closes), not a local tally — two phones at two doors must each show the
  gate's total. Closing a result also re-runs an open Look up, so the guest just admitted
  shows as checked in.
- Typing a full code in Look up and pressing Enter checks it in directly: the path for a
  guest whose phone is dead.
- `BarcodeDetector` exists in Chrome on Android, not in desktop Edge on Windows, so a
  desktop screenshot only ever shows the "cannot scan" fallback. Check the camera view on
  a phone.

## Messaging

- Providers are chosen per channel: `messaging(channel)`. Email goes through Resend
  (`EMAIL_PROVIDER=resend`, `lib/messaging/resend.ts`); SMS and WhatsApp stay on
  `MESSAGING_PROVIDER=stub` until the Moolre adapter exists. It is deliberately
  unimplemented until their API contract is confirmed.
- **A channel that is not live cannot be used.** Ticket delivery only queues SMS/WhatsApp
  rows once their provider is live, the broadcast form disables their tiles, and
  `createBroadcast` refuses them — a stub send is recorded as sent and reaches nobody.
- Each outbox row's id is Resend's `Idempotency-Key`, so a worker retry cannot deliver
  twice. Emails are React Email templates in `components/emails/`, rebuilt from the order
  at send time (`lib/messaging/email.ts`); the row's `body` is the SMS text, kept as the
  record. Broadcast emails take an optional subject; blank falls back to the event name.
- There is no public send route, unlike Resend's Next.js guide: a route that emails
  whatever it is given is an open relay. The delivery worker, behind `CRON_SECRET`, is the
  only sender. Do not trigger it by hand to test — it drains the production outbox.
- The Resend key is **send-only**: it cannot list domains, so a domain's status has to be
  read in the Resend dashboard.

## Styling

Tailwind v4 + shadcn (`base-nova`, **Base UI** primitives, lucide icons).

- Semantic tokens only. The project's own additions are `--cta` / `--cta-foreground` (the
  public buy button, deliberately separate from `--primary`), `--success`, `--warning`,
  `--highlight`, `--surface`.
- **`--muted` is a surface; muted text is `--muted-foreground`.** An earlier version of
  this codebase used `--muted` for text, and the shadcn migration inverted it.
- The public event page is pinned dark by `.theme-night`. Anything rendered through a
  **portal** (drawer, dialog, popover) lands outside that subtree and must repeat the
  class or it renders in the admin palette.
- **Nothing applies the `.dark` class, so `dark:` variants never apply.** System dark
  mode comes from the `@media (prefers-color-scheme: dark)` block, so both have to be
  kept in step. A partial override there once produced dark cards with near-black text.
  Pick a token that is right in both schemes instead.
- Status pills are `bg-{status}/15 text-{status}`. On a solid status fill (the gate's
  result screens) use `text-background`: white on the light theme's dark greens and reds,
  near-black on the dark theme's brighter ones.
- Screenshot in **both** colour schemes. Forcing `prefers-color-scheme: light` in every
  check is how the dark-cards bug shipped.

## Next.js and Base UI gotchas

- **A `"use server"` file may export only async functions.** Exporting one object from
  `app/admin/orders/actions.ts` stopped Next loading the file, and Retry, Resend, Void and
  Mark refunded all returned a bare 500. Types are fine; put initial states in the client
  file that uses them.
- A production 500 from a server action shows the browser only React error #441, which
  means "the action threw". Reproduce it on the dev server to read the real message.
- Use `render={<Link />}`, not `asChild`.
- A `<Link>` rendered through a button component needs `nativeButton={false}`, or Base UI
  warns that native button semantics are gone.
- `className` on `DrawerContent` lands on the **popup**, which is the element carrying
  `data-swipe-axis`. Use plain `data-[swipe-axis=x]:` variants — `group-*` variants only
  match ancestors and will silently never apply.
- Drawer width is `--drawer-content-width`, not a max-width. Override the variable at the
  same breakpoint the component sets it.
- `@react-email/render` must be a top-level dependency: the Resend SDK imports it at send
  time, and installed only under `@react-email/components` it does not resolve.

## Rich text

The event `description` and `booking_info` (the bookings block under the ticket cards) are
the only fields where admin input renders as markup to buyers. Both are sanitised **on
save** (`lib/rich-text.ts`), so the database never holds anything the public page has to
be careful with. `check:richtext` guards the allowlist.

Plain text pasted into either editor is read as WhatsApp (`lib/whatsapp-text.ts`):
`*bold*` stays bold rather than becoming Tiptap's Markdown italic, and phone numbers,
emails and URLs become links. Only `http(s)` links open a new tab — a `tel:` one would
leave a blank tab on a phone.

`description` also feeds `<meta name="description">`, which is what a WhatsApp link
preview shows — use `richTextToPlain`, never the raw markup.

## Still open

- **Resend domain.** `EMAIL_FROM` needs a domain verified in Resend. Until then only
  `onboarding@resend.dev` sends, only to the Resend account owner's own address, and
  lands in spam; every other buyer's ticket email fails with a 403 and is parked. Once
  verified, retry the parked ones from Failed messages.
- `check:orders` and `check:broadcast` look up a seed tier called "Regular" on
  `sample-event`, which the live data no longer has — both fail before testing anything.
- Buyers' CSV export follows the search but not the status tab.
- Paystack live keys, USD enabled on the Paystack account, and a staging project.
