"use client";

import { createContext, useContext, useState } from "react";

import { XIcon } from "lucide-react";

import { useIsMobile } from "@/hooks/use-mobile";

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
/**
 * One sheet, opened from two places — the fixed bar on a phone and the rail on desktop.
 *
 * The triggers sit in different corners of the layout, so the open state lives in
 * context rather than being lifted into either of them. That keeps the tier markup to a
 * single instance no matter how many ways there are to reach it.
 */
const TicketSheetContext = createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
} | null>(null);

function useTicketSheet() {
  const ctx = useContext(TicketSheetContext);
  if (!ctx)
    throw new Error("Ticket sheet trigger rendered outside its provider");
  return ctx;
}

export function TicketSheetProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <TicketSheetContext.Provider value={{ open, setOpen }}>
      {children}
    </TicketSheetContext.Provider>
  );
}

/**
 * The ticket sheet — a drawer, entering from the edge nearest the thumb.
 *
 * Up from the bottom on a phone, in from the right on a desktop. `swipeDirection` is a
 * prop rather than a class, so the breakpoint has to be read in JS; the sizing that
 * follows from it is scoped with the `data-swipe-axis` variants the drawer sets.
 *
 * Base UI owns focus trapping, Escape, scroll locking and the inert background, so none
 * of that is re-implemented here. Swipe-to-dismiss comes with it, which is how every
 * other app on a buyer's phone behaves.
 *
 * `theme-night` is repeated on the content because the drawer renders through a portal,
 * which lands it outside the event page's own themed subtree.
 */
export function TicketSheet({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const { open, setOpen } = useTicketSheet();
  const isMobile = useIsMobile();

  return (
    <Drawer
      open={open}
      onOpenChange={setOpen}
      swipeDirection={isMobile ? "down" : "right"}
      showSwipeHandle
    >
      {/* `className` here lands on the popup, which is the element carrying
          `data-swipe-axis` — so these are plain data variants, not `group-*` ones, which
          only ever match an ancestor.

          Width comes from `--drawer-content-width`, not a max-width, so widening the
          side panel means overriding that variable at the same `sm:` breakpoint the
          component sets it. 24rem crushes the tier name against the torn-off price. */}
      <DrawerContent className="theme-night bg-background text-foreground data-[swipe-axis=x]:sm:[--drawer-content-width:30rem]">
        <DrawerHeader className="relative">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>

          {/* Swiping down is the usual way out on a phone, but not everyone can make
              that gesture, and on a desktop there is nothing to swipe with. */}
          <DrawerClose
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute top-2 right-4 flex size-9 items-center justify-center rounded-full transition focus-visible:ring-2 focus-visible:outline-none"
          >
            <XIcon className="size-5" />
          </DrawerClose>
        </DrawerHeader>

        {/* A flex item, not h-full — height does not resolve inside a content-sized
            drawer, so the scroll region has to grow instead. */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-6 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

/**
 * Opens the sheet.
 *
 * Hidden entirely when JavaScript is unavailable — see the `noscript` rule in
 * event-view — because a button that cannot do anything is worse than no button. The
 * tiers render inline in that case instead.
 */
export function OpenTicketsButton({
  label,
  block = false,
}: {
  label: string;
  block?: boolean;
}) {
  const { setOpen } = useTicketSheet();

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className={`js-only ${
        block ? "block w-full" : "shrink-0"
      } bg-cta px-8 py-3.5 text-center text-[0.95rem] font-bold tracking-[-0.01em] text-cta-foreground transition hover:brightness-95 focus-visible:ring-2 focus-visible:ring-cta focus-visible:ring-offset-4 focus-visible:ring-offset-background focus-visible:outline-none`}
    >
      {label}
    </button>
  );
}
