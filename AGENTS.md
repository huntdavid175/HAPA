<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# HAPA — event ticketing

Single-event ticketing for Ghana. Buyers never sign up; a ticket is an unguessable
`qr_token` in a link sent over WhatsApp and SMS. Read `plan.md` for where the build is.

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
- **Only the Paystack webhook issues tickets.** The redirect callback verifies for UX and
  issues nothing: mobile money often confirms after the buyer has closed the tab.
- **Overselling is prevented in the database** (`reserve_tickets`, row locks in id order),
  not in application code.
- Authorization lives in `lib/auth.ts` (`requireAdmin` / `requireStaffOrAdmin`), called
  from layouts *and* from route handlers. `proxy.ts` is an optimistic redirect only —
  layouts do not wrap route handlers, so a CSV or QR route must re-check the role itself.
- Times are stored UTC and displayed in the **venue's** timezone. `lib/datetime.ts` is the
  single conversion point; forms post `YYYY-MM-DDTHH:mm` and let the server convert.
- **Marketing claims are the organiser's, never the code's.** `ticket_tiers.benefits`,
  `.highlight` and `.badge` are authored in the admin form and nothing derives them.
  "Most popular" computed from sales would be a lie on an event that has sold nothing,
  and hard-coding the middle tier breaks the moment a fourth is added. The same rule
  binds agents: do not write benefit or badge copy onto a **published** event to see how
  it looks — that is live text in front of buyers. Use a draft event.

## Environment and deployment

- **`NEXT_PUBLIC_SITE_URL` is load-bearing in three places**: the Paystack return URL
  (`checkoutCallbackUrl`), the ticket links sent over WhatsApp/SMS
  (`lib/messaging/ticket-message.ts`), and share links and QR codes (`lib/share.ts`).
  Wrong value means buyers get dead links, not a visible error.
- It is `NEXT_PUBLIC_*`, so it is **inlined at build time**. Changing it in Vercel does
  nothing until you redeploy.
- Boot validation only checks the URL's *shape*. `http://localhost:3000` is structurally
  valid, so a production deployment carrying the `.env.example` default passes every
  check and then redirects paying buyers to their own machine. It shipped that way once.
- Store `PAYSTACK_SECRET_KEY` as a Vercel **Sensitive** variable, not a plain one — plain
  values stay readable in the dashboard and via `vercel env pull`. Set the live key as
  Sensitive from the start so it never sits in readable storage.
- Rotating that key has an ordering trap: it is also the webhook HMAC-SHA512 signing key
  (`lib/paystack.ts`). Paystack signs with the new key the instant you generate it, so
  every signature fails until Vercel is updated **and redeployed**. Update `.env.local`
  too, or `check:paystack` and `check:webhook` fail.

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
- Seeding temporary accounts and deleting them afterwards is the established pattern; the
  Supabase project is production, so clean up.

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
- **Nothing applies the `.dark` class.** System dark mode comes from the
  `@media (prefers-color-scheme: dark)` block, so both have to be kept in step. A partial
  override there once produced dark cards with near-black text.
- Screenshot in **both** colour schemes. Forcing `prefers-color-scheme: light` in every
  check is how the above shipped.

## Base UI gotchas

- Use `render={<Link />}`, not `asChild`.
- A `<Link>` rendered through a button component needs `nativeButton={false}`, or Base UI
  warns that native button semantics are gone.
- `className` on `DrawerContent` lands on the **popup**, which is the element carrying
  `data-swipe-axis`. Use plain `data-[swipe-axis=x]:` variants — `group-*` variants only
  match ancestors and will silently never apply.
- Drawer width is `--drawer-content-width`, not a max-width. Override the variable at the
  same breakpoint the component sets it.

## Rich text

The event description is the only field where admin input renders as markup to buyers.
It is sanitised **on save** (`lib/rich-text.ts`), so the database never holds anything the
public page has to be careful with. `check:richtext` guards the allowlist.

`description` also feeds `<meta name="description">`, which is what a WhatsApp link
preview shows — use `richTextToPlain`, never the raw markup.

## Still open

- **Tickets go out by email** through Resend (`EMAIL_PROVIDER=resend`, `lib/messaging/
  resend.ts`). Providers are chosen per channel: `messaging(channel)`. SMS/WhatsApp stay
  on `MESSAGING_PROVIDER=stub` — the Moolre adapter is deliberately unimplemented until
  their API contract is confirmed — and ticket delivery only queues SMS/WhatsApp rows once
  that provider is live, so the order page never claims "sent by SMS" for a stub send.
- Each outbox row's id is Resend's `Idempotency-Key`, so a worker retry cannot deliver
  twice. The email is rebuilt from the order at send time (`lib/messaging/email.ts`); the
  row's `body` is the SMS text, kept as the record.
- `EMAIL_FROM` needs a domain verified in Resend. Until then only
  `onboarding@resend.dev` sends, and only to the Resend account owner's own address.
- `check:orders` and `check:broadcast` look up a seed tier called "Regular" on
  `sample-event`, which the live data no longer has — both fail before testing anything.
- **The Paystack webhook is not registered.** Nothing has ever reached
  `/api/webhooks/paystack`. Every ticket issued so far came from the callback page's
  inline verify, which contradicts the settled decision above — a buyer who closes the
  tab before mobile money confirms currently gets nothing.
- **`NEXT_PUBLIC_SITE_URL` on Vercel still points at localhost.** Until it is corrected
  and redeployed, the Paystack return URL and every share QR generated on production are
  dead links.
- Paystack live keys and a staging project.
- `app/scan/scanner.tsx` has the repo's only lint errors (`react-hooks/set-state-in-effect`).
- Staff, broadcasts and the share kit have not been moved to shadcn.
