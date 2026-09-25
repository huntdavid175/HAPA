"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { MailIcon, MessageCircleIcon, SendIcon, SmartphoneIcon } from "lucide-react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { createBroadcast, drainOutbox, type BroadcastState } from "./actions";

const initial: BroadcastState = { error: null, ok: null };

type Channel = "email" | "sms" | "whatsapp";

function Submit({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? <Spinner data-icon="inline-start" /> : <SendIcon data-icon="inline-start" />}
      {pending ? pendingLabel : label}
    </Button>
  );
}

function Feedback({ state }: { state: BroadcastState }) {
  if (state.error)
    return (
      <p role="alert" className="text-destructive text-sm font-medium">
        {state.error}
      </p>
    );
  if (state.ok)
    return (
      <p role="status" className="text-success text-sm font-medium">
        {state.ok}
      </p>
    );
  return null;
}

const CHANNELS: {
  value: Channel;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  help: string;
}[] = [
  {
    value: "email",
    label: "Email",
    icon: MailIcon,
    help: "Any wording, to the address each buyer gave at checkout.",
  },
  {
    value: "sms",
    label: "SMS",
    icon: SmartphoneIcon,
    help: "Any wording, no approval needed. Best for anything unplanned.",
  },
  {
    value: "whatsapp",
    label: "WhatsApp",
    icon: MessageCircleIcon,
    help: "Only a template Meta approved in advance. Your wording is not sent as-is.",
  },
];

/**
 * Writing an announcement.
 *
 * Channels are tiles rather than bare checkboxes, and each says whether it is actually
 * connected. One that is not connected is disabled: ticking it would record a message
 * as sent that nobody receives. The action refuses those channels too, so the rule
 * does not depend on this page.
 */
export function ComposeForm({
  eventId,
  tiers,
  live,
}: {
  eventId: string;
  tiers: { id: string; name: string }[];
  /** Which channels have a real provider behind them. */
  live: Record<Channel, boolean>;
}) {
  const [state, action] = useActionState(createBroadcast, initial);
  const [body, setBody] = useState("");
  // Only live channels start ticked, and only live channels can be ticked at all.
  const [chosen, setChosen] = useState<Record<Channel, boolean>>({
    email: live.email,
    sms: false,
    whatsapp: false,
  });
  const anyLive = live.email || live.sms || live.whatsapp;
  // The action reads a blank tierId as "everyone"; Select cannot hold a blank value, so
  // the choice lives here and posts through a hidden input.
  const [tier, setTier] = useState("all");
  const [checkedIn, setCheckedIn] = useState("any");

  // 160 GSM-7 characters per segment; each extra segment is charged separately.
  const segments = body.length === 0 ? 0 : Math.ceil(body.length / 160);

  return (
    <form action={action}>
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="tierId" value={tier === "all" ? "" : tier} />
      <input type="hidden" name="checkedIn" value={checkedIn} />

      <FieldGroup>
        <FieldSet>
          <FieldLegend variant="label">Send by</FieldLegend>
          <div className="grid gap-3 sm:grid-cols-3">
            {CHANNELS.map((c) => (
              <label
                key={c.value}
                className={cn(
                  "has-focus-visible:ring-ring/50 relative flex flex-col gap-2 rounded-lg border p-3 transition-colors has-focus-visible:ring-[3px]",
                  live[c.value]
                    ? "hover:bg-muted/50 cursor-pointer"
                    : "bg-muted/40 cursor-not-allowed border-dashed opacity-60",
                  chosen[c.value] && "border-primary bg-primary/5 hover:bg-primary/10",
                )}
              >
                <input
                  type="checkbox"
                  name="channels"
                  value={c.value}
                  disabled={!live[c.value]}
                  checked={chosen[c.value]}
                  onChange={(e) => setChosen((prev) => ({ ...prev, [c.value]: e.target.checked }))}
                  className="accent-primary absolute top-3 right-3 size-4"
                />
                <c.icon className="text-muted-foreground size-5" />
                <span className="flex items-center gap-2 text-sm font-medium">
                  {c.label}
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[0.6875rem] leading-none font-medium",
                      live[c.value]
                        ? "bg-success/15 text-success"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {live[c.value] ? "Live" : "Not connected"}
                  </span>
                </span>
                <span className="text-muted-foreground text-xs leading-snug">{c.help}</span>
              </label>
            ))}
          </div>
        </FieldSet>

        {chosen.email ? (
          <Field>
            <FieldLabel htmlFor="subject">
              Email subject <span className="text-muted-foreground">(optional)</span>
            </FieldLabel>
            <Input
              id="subject"
              name="subject"
              maxLength={120}
              placeholder="Doors now open at 7pm"
            />
            <FieldDescription>
              Left blank, it reads &ldquo;An update about&rdquo; followed by the event name.
            </FieldDescription>
          </Field>
        ) : null}

        <Field>
          <FieldLabel htmlFor="body">Message</FieldLabel>
          <Textarea
            id="body"
            name="body"
            rows={5}
            maxLength={480}
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Doors now open at 7pm, not 8pm. Same venue. See you there."
          />
          <FieldDescription className="tabular-nums">
            {body.length}/480 characters
            {chosen.sms && segments > 0
              ? `, ${segments} SMS segment${segments === 1 ? "" : "s"} per person${segments > 1 ? ", each billed separately" : ""}`
              : ""}
          </FieldDescription>
        </Field>

        {chosen.whatsapp ? (
          <Field>
            <FieldLabel htmlFor="whatsappTemplate">WhatsApp template name</FieldLabel>
            <Input id="whatsappTemplate" name="whatsappTemplate" placeholder="event_time_change" />
            <FieldDescription>The exact name of a template Meta has approved.</FieldDescription>
          </Field>
        ) : null}

        <FieldSet>
          <FieldLegend variant="label">Who gets it</FieldLegend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="tierFilter" className="text-muted-foreground font-normal">
                Ticket type
              </FieldLabel>
              <Select
                value={tier}
                onValueChange={(v) => v && setTier(v)}
                items={[
                  { value: "all", label: "Everyone who bought" },
                  ...tiers.map((t) => ({ value: t.id, label: `Only ${t.name}` })),
                ]}
              >
                <SelectTrigger id="tierFilter" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">Everyone who bought</SelectItem>
                    {tiers.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        Only {t.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="checkedInFilter" className="text-muted-foreground font-normal">
                Check-in
              </FieldLabel>
              <Select
                value={checkedIn}
                onValueChange={(v) => v && setCheckedIn(v)}
                items={[
                  { value: "any", label: "Everyone" },
                  { value: "no", label: "Not arrived yet" },
                  { value: "yes", label: "Already checked in" },
                ]}
              >
                <SelectTrigger id="checkedInFilter" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="any">Everyone</SelectItem>
                    <SelectItem value="no">Not arrived yet</SelectItem>
                    <SelectItem value="yes">Already checked in</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </FieldSet>

        <div className="flex flex-wrap items-center gap-3 border-t pt-5">
          {anyLive ? (
            <Submit label="Send message" pendingLabel="Queueing…" />
          ) : (
            <p className="text-muted-foreground text-sm">
              No channel is connected yet, so there is nothing to send with.
            </p>
          )}
          <Feedback state={state} />
        </div>
      </FieldGroup>
    </form>
  );
}

export function DrainButton() {
  const [state, action] = useActionState(drainOutbox, initial);
  return (
    <form action={action} className="flex flex-wrap items-center justify-end gap-3">
      <Feedback state={state} />
      <DrainSubmit />
    </form>
  );
}

function DrainSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {pending ? "Sending…" : "Send queued now"}
    </Button>
  );
}
