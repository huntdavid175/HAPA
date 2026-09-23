<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# HAPA — event ticketing

Single-event ticketing for Ghana. Buyers never sign up; a ticket is an unguessable
`qr_token` in a link sent over WhatsApp and SMS. Read `plan.md` for where the build is.

## Decisions that are settled — don't relitigate

- Money is **integer pesewas** everywhere, never floats. `formatPesewas` is the only place
  it becomes a string.
- **Only the Paystack webhook issues tickets.** The redirect callback verifies for UX and
  issues nothing: mobile money often confirms after the buyer has closed the tab.
- **Overselling is prevented in the database** (`reserve_tickets`, row locks in id order),
  not in application code.
- Authorization lives in `lib/auth.ts` (`requireAdmin` / `requireStaffOrAdmin`), called
  from layouts *and* from route handlers. `proxy.ts` is an optimistic redirect only —
  layouts do not wrap route handlers, so a CSV or QR route must re-check the role itself.
- Times are stored UTC and displayed in the **venue's** timezone. `lib/datetime.ts` is the
  single conversion point; forms post `YYYY-MM-DDTHH:mm` and let the server convert.

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

- `MESSAGING_PROVIDER=stub` sends nothing. The Moolre adapter is deliberately
  unimplemented until their API contract is confirmed — no messages reach a buyer today.
- Paystack live keys, the webhook URL registration, and a staging project.
