"use client";

import { useMemo, useState } from "react";
import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Half-hour steps: nobody schedules a door for 19:47. */
const TIMES = Array.from({ length: 48 }, (_, i) => {
  const hh = String(Math.floor(i / 2)).padStart(2, "0");
  const mm = i % 2 ? "30" : "00";
  return `${hh}:${mm}`;
});

/** Africa/Accra first — that is where these events are. */
const ZONES = [
  "Africa/Accra",
  "Africa/Lagos",
  "Africa/Nairobi",
  "Europe/London",
  "America/New_York",
  "UTC",
];

/** "2026-10-07T20:00" — the shape `localInputToUtcIso` already knows how to read. */
function toLocalInput(date: Date | undefined, time: string): string {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}T${time}`;
}

/** Parses "2026-10-07T20:00" back into a date and a time, without a timezone shift. */
function fromLocalInput(value: string): { date?: Date; time: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})/.exec(value);
  if (!match) return { time: "20:00" };
  return {
    date: new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    time: match[4],
  };
}

function label(date: Date | undefined) {
  return date
    ? date.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Pick a date";
}

/**
 * When the event runs.
 *
 * A range calendar rather than two date fields, because a festival that runs the 7th to
 * the 10th is one decision, not two — and picking an end before a start is not something
 * the organiser should be able to express in the first place.
 *
 * The visible controls are all client state; what actually posts are two hidden fields
 * in the `YYYY-MM-DDTHH:mm` shape the server already parses with `localInputToUtcIso`.
 * That keeps the timezone conversion in one tested place instead of duplicating it here.
 */
export function ScheduleFields({
  defaultStartsAtLocal,
  defaultEndsAtLocal,
  defaultTimezone,
}: {
  defaultStartsAtLocal: string;
  defaultEndsAtLocal: string;
  defaultTimezone: string;
}) {
  const start = useMemo(() => fromLocalInput(defaultStartsAtLocal), [defaultStartsAtLocal]);
  const end = useMemo(() => fromLocalInput(defaultEndsAtLocal), [defaultEndsAtLocal]);

  const [range, setRange] = useState<DateRange | undefined>(
    start.date ? { from: start.date, to: end.date } : undefined,
  );
  const [startTime, setStartTime] = useState(start.time);
  const [endTime, setEndTime] = useState(defaultEndsAtLocal ? end.time : "23:00");
  const [hasEnd, setHasEnd] = useState(Boolean(defaultEndsAtLocal));
  const [timezone, setTimezone] = useState(defaultTimezone);
  const [open, setOpen] = useState(false);

  const from = range?.from;
  // A single-day event with an end time still needs an end date, and it is the start day.
  const to = range?.to ?? range?.from;
  const spansDays = Boolean(range?.to && range.from && +range.to !== +range.from);

  // A run across several days *is* the end date. Leaving that optional would let someone
  // pick 7–9 October, skip the checkbox, and publish a three-day festival that reads as
  // a single night. So the checkbox only governs a same-day end time.
  const showEnd = hasEnd || spansDays;

  return (
    <div className="flex flex-col gap-6">
      <Field>
        <FieldLabel>Dates</FieldLabel>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                type="button"
                className="w-full justify-start font-normal"
              />
            }
          >
            <CalendarIcon data-icon="inline-start" />
            {from
              ? spansDays
                ? `${label(from)} — ${label(range?.to)}`
                : label(from)
              : "Pick a date"}
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              numberOfMonths={2}
              selected={range}
              onSelect={setRange}
              autoFocus
            />
          </PopoverContent>
        </Popover>
        <FieldDescription>
          Click one day for a single-night event, or click a start and an end day for one
          that runs across several.
        </FieldDescription>
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="startTime">Doors open</FieldLabel>
          <Select value={startTime} onValueChange={(v) => v && setStartTime(v)}>
            <SelectTrigger id="startTime" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {TIMES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <Field data-disabled={!showEnd || undefined}>
          <FieldLabel htmlFor="endTime">
            {spansDays ? "Ends on the last day at" : "Ends at"}
          </FieldLabel>
          <Select
            value={endTime}
            onValueChange={(v) => v && setEndTime(v)}
            disabled={!showEnd}
          >
            <SelectTrigger id="endTime" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {TIMES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field orientation="horizontal" data-disabled={spansDays || undefined}>
        <Checkbox
          id="hasEnd"
          checked={showEnd}
          disabled={spansDays}
          onCheckedChange={(checked) => setHasEnd(checked === true)}
        />
        <FieldLabel htmlFor="hasEnd" className="font-normal">
          {spansDays
            ? "A multi-day event always shows when it ends"
            : "Show an end time on the public page"}
        </FieldLabel>
      </Field>

      <Field>
        <FieldLabel htmlFor="timezone">Timezone</FieldLabel>
        <Select value={timezone} onValueChange={(v) => v && setTimezone(v)}>
          <SelectTrigger id="timezone" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {ZONES.map((z) => (
                <SelectItem key={z} value={z}>
                  {z.replace("_", " ")}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription>
          Every time on the public page and the ticket is shown in the venue&rsquo;s clock,
          not the visitor&rsquo;s.
        </FieldDescription>
      </Field>

      {/* What actually posts. */}
      <input type="hidden" name="startsAt" value={toLocalInput(from, startTime)} />
      <input
        type="hidden"
        name="endsAt"
        value={showEnd ? toLocalInput(to, endTime) : ""}
      />
      <input type="hidden" name="timezone" value={timezone} />
    </div>
  );
}
