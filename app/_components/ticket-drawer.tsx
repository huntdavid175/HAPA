"use client";

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
import { useCart } from "./cart";
import { CartContents } from "./cart-contents";

/**
 * The cart, as a drawer.
 *
 * Up from the bottom on a phone, in from the right on a desktop. `swipeDirection` is a
 * prop rather than a class, so the breakpoint has to be read in JS; the sizing that
 * follows is scoped with the `data-swipe-axis` variants the drawer sets on its popup.
 *
 * Base UI owns focus trapping, Escape, scroll locking and the inert background, so none
 * of that is re-implemented here.
 *
 * `theme-night` is repeated on the content because the drawer renders through a portal,
 * which lands it outside the event page's own themed subtree.
 */
export function TicketDrawer({
  checkoutOpen,
  eventId,
  unavailableNotice,
}: {
  checkoutOpen: boolean;
  eventId: string;
  unavailableNotice: string | null;
}) {
  const { open, setOpen, ticketCount } = useCart();
  const isMobile = useIsMobile();

  return (
    <Drawer
      open={open}
      onOpenChange={setOpen}
      swipeDirection={isMobile ? "down" : "right"}
      showSwipeHandle
    >
      <DrawerContent className="theme-night bg-background text-foreground data-[swipe-axis=x]:sm:[--drawer-content-width:30rem]">
        <DrawerHeader className="relative">
          <DrawerTitle>{unavailableNotice ? "Tickets" : "Your tickets"}</DrawerTitle>
          <DrawerDescription>
            {unavailableNotice
              ? "Why tickets are not available."
              : ticketCount === 0
                ? "Nothing selected yet. Pick a ticket to get started."
                : "Change the quantities, then pay. Nothing is charged until you do."}
          </DrawerDescription>

          {/* Swiping is the usual way out, but not everyone can make that gesture and on
              a desktop there is nothing to swipe with. */}
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
          {unavailableNotice ? (
            <p className="text-sm text-muted-foreground">{unavailableNotice}</p>
          ) : (
            <CartContents eventId={eventId} checkoutOpen={checkoutOpen} />
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
