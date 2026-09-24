"use client";

import { useId, useOptimistic, useState, useTransition } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CheckIcon,
  ChevronDownIcon,
  GripVerticalIcon,
  PencilIcon,
  PlusIcon,
  TicketIcon,
} from "lucide-react";
import { cn } from "cn";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Database } from "@/lib/database.types";
import { formatPesewas } from "@/lib/format";
import { toCurrency } from "@/lib/currency";
import { reorderTiers } from "./actions";
import { DeactivateTierButton, TierForm, type TierFormValues } from "./forms";

type Tier = Database["public"]["Tables"]["ticket_tiers"]["Row"];

function toFormValues(tier: Tier): TierFormValues {
  return {
    id: tier.id,
    name: tier.name,
    description: tier.description,
    benefits: (tier.benefits ?? []).join("\n"),
    highlight: tier.highlight ?? false,
    badge: tier.badge ?? "",
    currency: toCurrency(tier.currency),
    priceGhs: (tier.price_pesewas / 100).toFixed(2),
    capacity: String(tier.capacity),
  };
}

/**
 * The tier list as the organiser arranges it. The order here is written to `position`,
 * which is the order buyers see the pricing cards in.
 */
export function TierList({ eventId, tiers }: { eventId: string; tiers: Tier[] }) {
  const [ordered, setOrdered] = useOptimistic(tiers);
  const [, startTransition] = useTransition();
  const [reorderError, setReorderError] = useState<string | null>(null);

  // `open` and `editing` are separate so the sheet keeps its content while it animates
  // closed, instead of flashing to the "new tier" title on the way out.
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tier | null>(null);

  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = ordered.findIndex((t) => t.id === active.id);
    const to = ordered.findIndex((t) => t.id === over.id);
    const next = arrayMove(ordered, from, to);

    startTransition(async () => {
      setOrdered(next);
      const result = await reorderTiers(
        eventId,
        next.map((t) => t.id),
      );
      // On failure the optimistic order falls back to the server's by itself.
      setReorderError(result.error);
    });
  }

  function openEditor(tier: Tier | null) {
    setEditing(tier);
    setOpen(true);
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {ordered.length === 0 ? (
          <Empty className="border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <TicketIcon />
              </EmptyMedia>
              <EmptyTitle>No tiers yet</EmptyTitle>
              <EmptyDescription>
                Add at least one price point before you publish.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <DndContext
            id={dndId}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext items={ordered} strategy={verticalListSortingStrategy}>
              <ul className="flex flex-col gap-3">
                {ordered.map((tier) => (
                  <TierCard key={tier.id} tier={tier} onEdit={() => openEditor(tier)} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}

        {reorderError ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            The new order was not saved: {reorderError}
          </p>
        ) : null}

        <div>
          <Button variant="outline" onClick={() => openEditor(null)}>
            <PlusIcon data-icon="inline-start" />
            Add a tier
          </Button>
        </div>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full data-[side=right]:sm:max-w-md">
          <SheetHeader className="border-b">
            <SheetTitle>{editing ? `Edit ${editing.name}` : "Add a tier"}</SheetTitle>
            <SheetDescription>
              {editing
                ? "Changes apply to new sales. Tickets already sold are untouched."
                : "A new price point, added to the end of the list."}
            </SheetDescription>
          </SheetHeader>
          <TierForm
            key={editing?.id ?? "new"}
            eventId={eventId}
            tier={editing ? toFormValues(editing) : undefined}
            onSaved={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}

function TierCard({ tier, onEdit }: { tier: Tier; onEdit: () => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tier.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10")}
    >
      <Collapsible
        className={cn(
          "rounded-xl border bg-card text-card-foreground transition-shadow",
          isDragging && "shadow-lg ring-2 ring-ring/40",
        )}
      >
        <div className="flex items-center gap-1 p-2 pr-3">
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Reorder ${tier.name}`}
            className="flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:cursor-grabbing"
          >
            <GripVerticalIcon className="size-4" />
          </button>

          <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-1.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-medium">{tier.name}</span>
                {tier.highlight ? (
                  <Badge variant="secondary">{tier.badge || "Highlighted"}</Badge>
                ) : null}
              </div>
              <span className="text-sm text-muted-foreground tabular-nums">
                {formatPesewas(tier.price_pesewas, toCurrency(tier.currency))} · {tier.capacity.toLocaleString()}{" "}
                capacity
              </span>
            </div>
            <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180" />
          </CollapsibleTrigger>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onEdit}
            aria-label={`Edit ${tier.name}`}
          >
            <PencilIcon />
          </Button>
        </div>

        <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0">
          <dl className="grid gap-4 border-t px-4 py-4 text-sm sm:grid-cols-2">
            <div className="flex flex-col gap-1 sm:col-span-2">
              <dt className="text-xs font-medium text-muted-foreground">Description</dt>
              <dd>
                {tier.description || <span className="text-muted-foreground">None</span>}
              </dd>
            </div>

            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <dt className="text-xs font-medium text-muted-foreground">What you get</dt>
              <dd>
                {tier.benefits.length ? (
                  <ul className="flex flex-col gap-1">
                    {tier.benefits.map((benefit) => (
                      <li key={benefit} className="flex items-start gap-2">
                        <CheckIcon className="mt-0.5 size-4 shrink-0 text-success" />
                        {benefit}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-muted-foreground">None listed</span>
                )}
              </dd>
            </div>

            <div className="flex flex-col gap-1">
              <dt className="text-xs font-medium text-muted-foreground">Pricing card</dt>
              <dd>{tier.highlight ? "Stands out" : "Standard"}</dd>
            </div>

            <div className="flex flex-col gap-1">
              <dt className="text-xs font-medium text-muted-foreground">Badge</dt>
              <dd>{tier.badge || <span className="text-muted-foreground">None</span>}</dd>
            </div>
          </dl>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t px-2 py-2">
            <DeactivateTierButton id={tier.id} />
            <Button variant="outline" size="sm" onClick={onEdit}>
              <PencilIcon data-icon="inline-start" />
              Edit
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}
