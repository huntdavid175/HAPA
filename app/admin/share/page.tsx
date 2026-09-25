import type { Metadata } from "next";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { eventUrl, qrSvg } from "@/lib/share";
import { formatEventDate, formatEventTime, formatPesewas } from "@/lib/format";
import { cheapestPrice } from "@/lib/pricing";
import { CopyButton } from "./copy-button";
import {
  AlertTriangleIcon,
  DownloadIcon,
  ExternalLinkIcon,
  MessageCircleIcon,
  QrCodeIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export const metadata: Metadata = { title: "Share kit" };
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
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <QrCodeIcon />
          </EmptyMedia>
          <EmptyTitle>No event yet</EmptyTitle>
          <EmptyDescription>
            Create an event first and its link and QR code will appear here.
          </EmptyDescription>
        </EmptyHeader>
        <Button nativeButton={false} render={<Link href="/admin/event" />}>
          Set up your event
        </Button>
      </Empty>
    );
  }

  const url = eventUrl(event.slug);
  const svg = await qrSvg(url);

  const { data: tiers } = await supabase
    .from("ticket_tiers")
    .select("price_pesewas, currency")
    .eq("event_id", event.id)
    .eq("active", true);

  // Same rule as the event page's "From": cedis first, since prices in two currencies
  // cannot be compared.
  const cheapest = cheapestPrice(tiers ?? []);

  // Pre-written so the organizer can paste straight into a WhatsApp group.
  const blurb = [
    event.name,
    `${formatEventDate(event.starts_at, event.timezone)} · ${formatEventTime(event.starts_at, event.timezone)}`,
    event.venue || null,
    cheapest ? `Tickets from ${formatPesewas(cheapest.pesewas, cheapest.currency)}` : null,
    "",
    `Get your ticket: ${url}`,
  ]
    .filter(Boolean)
    .join("\n");

  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(blurb)}`;
  const isDraft = event.status === "draft";
  const isLocalhost = url.includes("localhost") || url.includes("127.0.0.1");

  const lines = blurb.split("\n");

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Share kit</h1>
        <p className="text-muted-foreground text-sm">
          One link and one QR code, both to the same page. The QR goes on posters, the link
          and the post go in chats.
        </p>
      </div>

      {isDraft ? (
        <Alert>
          <AlertTriangleIcon />
          <AlertTitle>This event is a draft</AlertTitle>
          <AlertDescription>
            Anyone opening the link or scanning the code sees nothing until you publish.
            The link never changes, so print posters whenever you like, but publish before
            they go up.
          </AlertDescription>
        </Alert>
      ) : null}

      {isLocalhost ? (
        <Alert>
          <AlertTriangleIcon />
          <AlertTitle>This is a localhost link</AlertTitle>
          <AlertDescription>
            It only works on this computer. Set NEXT_PUBLIC_SITE_URL to your real domain
            before printing anything.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* The QR is the one thing here made to be printed, so it gets the big card. */}
        <Card>
          <CardHeader>
            <CardTitle>QR code</CardTitle>
            <CardDescription>
              Keep the white border when you place it in a design; a code pressed against
              artwork often fails to scan. Test it with a phone before printing.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-5">
            <div className="bg-muted/60 flex w-full justify-center rounded-xl p-6 sm:p-10">
              <div
                className="w-full max-w-[280px] rounded-xl bg-white p-3 shadow-sm [&>svg]:h-auto [&>svg]:w-full"
                /* Server-generated from the event URL by the qrcode library — no user
                   input reaches this markup. */
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            </div>

            <div className="grid w-full gap-3 sm:grid-cols-2">
              <Button
                variant="outline"
                nativeButton={false}
                render={<a href={`/admin/share/qr?format=svg&slug=${event.slug}`} />}
              >
                <DownloadIcon data-icon="inline-start" />
                SVG for print
              </Button>
              <Button
                variant="outline"
                nativeButton={false}
                render={<a href={`/admin/share/qr?format=png&slug=${event.slug}`} />}
              >
                <DownloadIcon data-icon="inline-start" />
                PNG, 1024px
              </Button>
            </div>
            <p className="text-muted-foreground text-center text-xs">
              A designer laying out a poster wants the SVG: it stays sharp at any size. The
              PNG is fine for social posts.
            </p>
          </CardContent>
        </Card>

        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Link</CardTitle>
              <CardDescription>The same address the QR code opens.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="bg-muted rounded-lg px-3 py-2.5 font-mono text-sm break-all">
                {url}
              </p>
              <div className="flex flex-wrap gap-3">
                <CopyButton value={url} />
                <Button
                  variant="ghost"
                  nativeButton={false}
                  render={<a href={url} target="_blank" rel="noreferrer" />}
                >
                  <ExternalLinkIcon data-icon="inline-start" />
                  Open
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ready-made post</CardTitle>
              <CardDescription>
                For a WhatsApp group, a status or a social post. This is how it reads once
                pasted.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {/* Shown as the message it becomes, not as raw text in a box: the organiser
                  is deciding whether it reads well in a chat, so show them a chat. */}
              <div className="bg-muted/60 rounded-xl p-4">
                <div className="bg-card relative max-w-[26rem] rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm shadow-sm ring-1 ring-foreground/5">
                  <p className="font-semibold">{lines[0]}</p>
                  {lines.slice(1).map((line, i) =>
                    line === "" ? (
                      <div key={i} className="h-2" />
                    ) : line.startsWith("Get your ticket:") ? (
                      <p key={i}>
                        Get your ticket:{" "}
                        <span className="text-highlight break-all underline">
                          {url}
                        </span>
                      </p>
                    ) : (
                      <p key={i} className="text-muted-foreground">
                        {line}
                      </p>
                    ),
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button nativeButton={false} render={<a href={whatsappHref} target="_blank" rel="noopener noreferrer" />}>
                  <MessageCircleIcon data-icon="inline-start" />
                  Share on WhatsApp
                </Button>
                <CopyButton value={blurb} label="Copy post" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
