import type { Metadata } from "next";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { eventUrl, qrSvg } from "@/lib/share";
import { formatEventDate, formatEventTime, formatPesewas } from "@/lib/format";
import { CopyButton } from "./copy-button";

export const metadata: Metadata = { title: "Share" };
export const dynamic = "force-dynamic";

export default async function SharePage() {
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("*")
    .not("status", "eq", "archived")
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!event) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-xl font-bold sm:text-2xl">Share your event</h1>
        <p className="mt-2 text-sm text-muted">
          Create an event first and its link and QR code will appear here.
        </p>
        <Link href="/admin/event" className="mt-4 inline-block text-sm underline">
          Set up your event
        </Link>
      </main>
    );
  }

  const url = eventUrl(event.slug);
  const svg = await qrSvg(url);

  const { data: tiers } = await supabase
    .from("ticket_tiers")
    .select("price_pesewas")
    .eq("event_id", event.id)
    .eq("active", true)
    .order("price_pesewas", { ascending: true });

  const cheapest = tiers?.[0]?.price_pesewas;

  // Pre-written so the organizer can paste straight into a WhatsApp group.
  const blurb = [
    event.name,
    `${formatEventDate(event.starts_at, event.timezone)} · ${formatEventTime(event.starts_at, event.timezone)}`,
    event.venue || null,
    cheapest ? `Tickets from ${formatPesewas(cheapest)}` : null,
    "",
    `Get your ticket: ${url}`,
  ]
    .filter(Boolean)
    .join("\n");

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(blurb)}`;
  const isDraft = event.status === "draft";
  const isLocalhost = url.includes("localhost") || url.includes("127.0.0.1");

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-xl font-bold sm:text-2xl">Share your event</h1>
      <p className="mt-2 text-sm text-muted">
        One link, one QR code. Both point at the same page — put the QR on posters and send
        the link in chats.
      </p>

      {isDraft ? (
        <p className="mt-5 rounded-xl border border-warning/40 bg-card p-4 text-sm">
          <strong className="text-warning">This event is a draft.</strong> Anyone opening
          the link or scanning the code will see nothing until you publish it. Print
          posters only after publishing — the link never changes, but the page is blank
          until then.
        </p>
      ) : null}

      {isLocalhost ? (
        <p className="mt-4 rounded-xl border border-warning/40 bg-card p-4 text-sm">
          <strong className="text-warning">This is a localhost link.</strong> It only works
          on this computer. Set <code className="font-mono">NEXT_PUBLIC_SITE_URL</code> to
          your real domain before printing anything.
        </p>
      ) : null}

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Link</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <code className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-card px-3 py-2.5 font-mono text-sm">
            {url}
          </code>
          <CopyButton value={url} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">QR code</h2>
        <p className="mt-1 text-sm text-muted">
          Keep the white border when you place it in a design — a QR pressed against
          artwork often fails to scan. Test it with a phone before printing.
        </p>

        <div className="mt-4 flex flex-wrap items-start gap-6">
          <div
            className="w-[240px] shrink-0 rounded-xl bg-white p-3 [&>svg]:h-auto [&>svg]:w-full"
            /* Server-generated from the event URL by the qrcode library — no user input
               reaches this markup. */
            dangerouslySetInnerHTML={{ __html: svg }}
          />

          <div className="flex flex-col gap-2">
            <a
              href={`/admin/share/qr?format=png&slug=${event.slug}`}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium"
            >
              Download PNG (1024px)
            </a>
            <a
              href={`/admin/share/qr?format=svg&slug=${event.slug}`}
              className="rounded-lg border border-border px-3 py-2 text-sm font-medium"
            >
              Download SVG (for print)
            </a>
            <p className="max-w-[16rem] text-xs text-muted">
              Use the SVG if a designer is laying out the poster — it stays sharp at any
              size. PNG is fine for social posts.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Ready-made post</h2>
        <p className="mt-1 text-sm text-muted">
          Paste this into a WhatsApp group, status or social post.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl border border-border bg-card p-4 text-sm whitespace-pre-wrap">
          {blurb}
        </pre>
        <div className="mt-3 flex flex-wrap gap-3">
          <CopyButton value={blurb} label="Copy post" />
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground"
          >
            Share on WhatsApp
          </a>
        </div>
      </section>
    </main>
  );
}
