import type { Metadata } from "next";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { isChannelLive } from "@/lib/messaging";
import { formatRelativeTime, formatTimestamp } from "@/lib/format";
import { MessageSquareIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { ComposeForm, DrainButton } from "./forms";

export const metadata: Metadata = { title: "Messages" };
export const dynamic = "force-dynamic";

export default async function BroadcastsPage() {
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select("id, name, timezone")
    .not("status", "eq", "archived")
    .order("starts_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!event) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MessageSquareIcon />
          </EmptyMedia>
          <EmptyTitle>No event yet</EmptyTitle>
          <EmptyDescription>Create an event before messaging anyone.</EmptyDescription>
        </EmptyHeader>
        <Button nativeButton={false} render={<Link href="/admin/event" />}>
          Set up your event
        </Button>
      </Empty>
    );
  }

  const [{ data: tiers }, { data: broadcasts }, { count: buyerCount }] = await Promise.all([
    supabase
      .from("ticket_tiers")
      .select("id, name")
      .eq("event_id", event.id)
      .eq("active", true)
      .order("position")
      .order("created_at"),
    supabase
      .from("broadcasts")
      .select("*")
      .eq("event_id", event.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event.id)
      .eq("status", "paid"),
  ]);

  const live = {
    email: isChannelLive("email"),
    sms: isChannelLive("sms"),
    whatsapp: isChannelLive("whatsapp"),
  };
  const audience = buyerCount ?? 0;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
          <p className="text-muted-foreground text-sm">
            Tell everyone holding a ticket about a time change, a reminder or directions.
            One message per buyer, not per ticket.
          </p>
        </div>
        <DrainButton />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>New message</CardTitle>
              <CardDescription>
                Queued straight away and sent within a minute.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ComposeForm eventId={event.id} tiers={tiers ?? []} live={live} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sent</CardTitle>
              <CardDescription>The last 20 messages, newest first.</CardDescription>
            </CardHeader>
            <CardContent>
              {(broadcasts ?? []).length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Nothing sent yet. Messages appear here with how many reached people.
                </p>
              ) : (
                <ul className="flex flex-col divide-y">
                  {(broadcasts ?? []).map((b) => (
                    <SentMessage key={b.id} broadcast={b} timezone={event.timezone} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Audience</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tracking-tight tabular-nums">
                {audience.toLocaleString()}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                {audience === 0
                  ? "Nobody has bought yet. A message now reaches no one."
                  : `buyer${audience === 1 ? "" : "s"} with paid tickets. Narrow it under “Who gets it”.`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Channels</CardTitle>
              <CardDescription>What actually reaches people right now.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-3">
                <ChannelStatus label="Email" live={live.email} via="Resend" />
                <ChannelStatus label="SMS" live={live.sms} via="Moolre" />
                <ChannelStatus label="WhatsApp" live={live.whatsapp} via="Moolre" />
              </ul>
              {!live.sms || !live.whatsapp ? (
                <p className="text-muted-foreground mt-4 text-xs leading-relaxed">
                  Messages on a channel that is not connected are recorded as sent but
                  never leave the building.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function ChannelStatus({ label, live, via }: { label: string; live: boolean; via: string }) {
  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={
            live
              ? "bg-success ring-success/25 size-2 rounded-full ring-4"
              : "bg-muted-foreground/40 size-2 rounded-full"
          }
        />
        <span className="font-medium">{label}</span>
      </span>
      <span className="text-muted-foreground text-xs">
        {live ? `Live via ${via}` : "Not connected"}
      </span>
    </li>
  );
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  queued: "Queued",
  sending: "Sending",
  sent: "Sent",
  failed: "Failed",
};

const CHANNEL_LABEL: Record<string, string> = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
};

function SentMessage({
  broadcast: b,
  timezone,
}: {
  broadcast: {
    body: string;
    subject: string | null;
    channels: string[];
    status: string;
    sent_count: number;
    failed_count: number;
    recipient_count: number;
    created_at: string;
  };
  timezone: string;
}) {
  const reached = b.recipient_count ? (b.sent_count / b.recipient_count) * 100 : 0;
  const failed = b.recipient_count ? (b.failed_count / b.recipient_count) * 100 : 0;

  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        {b.channels.map((c) => (
          <Badge key={c} variant="secondary">
            {CHANNEL_LABEL[c] ?? c}
          </Badge>
        ))}
        <Badge variant={b.status === "failed" ? "destructive" : "outline"}>
          {STATUS_LABEL[b.status] ?? b.status}
        </Badge>
        <time
          dateTime={b.created_at}
          title={formatTimestamp(b.created_at, timezone)}
          className="text-muted-foreground ml-auto text-xs"
        >
          {formatRelativeTime(b.created_at, timezone)}
        </time>
      </div>

      {b.subject ? <p className="text-sm font-medium">{b.subject}</p> : null}
      <p className="line-clamp-3 text-sm whitespace-pre-wrap">{b.body}</p>

      <div className="flex flex-col gap-1.5">
        <div
          role="progressbar"
          aria-label={`${b.sent_count} of ${b.recipient_count} sent`}
          aria-valuemin={0}
          aria-valuemax={b.recipient_count}
          aria-valuenow={b.sent_count}
          className="bg-muted flex h-1.5 overflow-hidden rounded-full"
        >
          <div className="bg-success h-full" style={{ width: `${reached}%` }} />
          <div className="bg-destructive h-full" style={{ width: `${failed}%` }} />
        </div>
        <p className="text-muted-foreground text-xs tabular-nums">
          {b.sent_count} of {b.recipient_count} sent
          {b.failed_count > 0 ? `, ${b.failed_count} failed` : ""}
        </p>
      </div>
    </li>
  );
}
