"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import type { Currency } from "@/lib/currency";

export type CartTier = {
  id: string;
  name: string;
  description: string;
  benefits: string[];
  /** Minor units of `currency`: pesewas for GHS, cents for USD. */
  pricePesewas: number;
  currency: Currency;
  available: number;
  unavailableReason: string | null;
  highlight: boolean;
  badge: string | null;
};

/** Mirrors the order_items CHECK constraint, so the UI cannot offer an invalid quantity. */
export const MAX_PER_TIER = 20;

type CartValue = {
  tiers: CartTier[];
  quantities: Record<string, number>;
  bumpQty: (tierId: string, delta: number) => void;
  /**
   * What a pricing card's button calls. Adds one and opens the drawer — unless the cart
   * holds tickets in another currency, in which case nothing is added and the drawer
   * opens on `switchTo`, asking the buyer to choose.
   */
  addTier: (tierId: string) => void;
  /** A tier the buyer tried to add in a different currency from their cart. */
  switchTo: CartTier | null;
  /** Empties the cart and adds `switchTo` in its place. */
  confirmSwitch: () => void;
  cancelSwitch: () => void;
  clear: () => void;
  ticketCount: number;
  /** In `currency`. One order is one Paystack charge, so it is never a mix. */
  totalPesewas: number;
  /** The cart's currency, or null while it is empty. */
  currency: Currency | null;
  items: { tier_id: string; quantity: number }[];
  open: boolean;
  setOpen: (open: boolean) => void;
  /**
   * Whether the pricing cards are on screen. Lives here because the cards sit full-width
   * at the bottom of the page while the panels that react to them are in the sticky rail
   * and the fixed bar — three different places in the tree, one piece of state.
   */
  plansInView: boolean;
  setPlansInView: (inView: boolean) => void;
};

const CartContext = createContext<CartValue | null>(null);

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("Cart consumer rendered outside CartProvider");
  return ctx;
}

/**
 * One cart, two places to change it.
 *
 * Quantities used to live inside the picker, which was fine while the drawer was the only
 * way to choose. Now the pricing cards on the page add to the same cart and the drawer
 * adjusts it, so the state has to sit above both — otherwise "add" and "increase" would
 * be editing different objects and the totals would disagree.
 */
export function CartProvider({
  tiers,
  children,
}: {
  tiers: CartTier[];
  children: React.ReactNode;
}) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [switchToId, setSwitchToId] = useState<string | null>(null);
  const [open, setOpenState] = useState(false);
  const [plansInView, setPlansInView] = useState(false);

  /**
   * Derives from previous state rather than a rendered value: two fast taps on "+" that
   * both read the same quantity would silently drop one, and on a phone buying three
   * tickets is three fast taps.
   */
  const bumpQty = useCallback(
    (tierId: string, delta: number) => {
      const tier = tiers.find((t) => t.id === tierId);
      if (!tier) return;
      const ceiling = Math.min(tier.available, MAX_PER_TIER);

      setQuantities((prev) => {
        // Paystack charges one currency per payment, so a cart never mixes them. Checked
        // against `prev` like the count, so a fast tap cannot slip a second currency in.
        if (delta > 0 && cartCurrency(tiers, prev, tier.currency) !== tier.currency) {
          return prev;
        }
        const current = prev[tierId] ?? 0;
        return { ...prev, [tierId]: Math.max(0, Math.min(current + delta, ceiling)) };
      });
    },
    [tiers],
  );

  const addTier = useCallback(
    (tierId: string) => {
      const tier = tiers.find((t) => t.id === tierId);
      if (!tier) return;
      const current = cartCurrency(tiers, quantities, tier.currency);
      if (current !== tier.currency) {
        setSwitchToId(tierId);
      } else {
        setSwitchToId(null);
        bumpQty(tierId, 1);
      }
      setOpenState(true);
    },
    [tiers, quantities, bumpQty],
  );

  // Closing the drawer answers the switch question with "no": a prompt left pending
  // would greet the buyer the next time they open their cart, long after they asked.
  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    if (!next) setSwitchToId(null);
  }, []);

  const confirmSwitch = useCallback(() => {
    if (!switchToId) return;
    const tier = tiers.find((t) => t.id === switchToId);
    setQuantities(tier && tier.available > 0 ? { [tier.id]: 1 } : {});
    setSwitchToId(null);
  }, [tiers, switchToId]);

  const cancelSwitch = useCallback(() => setSwitchToId(null), []);

  const clear = useCallback(() => setQuantities({}), []);

  const value = useMemo<CartValue>(() => {
    const items = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([tier_id, quantity]) => ({ tier_id, quantity }));

    const chosen = tiers.filter((tier) => (quantities[tier.id] ?? 0) > 0);

    return {
      tiers,
      quantities,
      bumpQty,
      addTier,
      switchTo: tiers.find((t) => t.id === switchToId) ?? null,
      confirmSwitch,
      cancelSwitch,
      clear,
      items,
      currency: chosen[0]?.currency ?? null,
      ticketCount: items.reduce((n, i) => n + i.quantity, 0),
      totalPesewas: tiers.reduce(
        (sum, tier) => sum + tier.pricePesewas * (quantities[tier.id] ?? 0),
        0,
      ),
      open,
      setOpen,
      plansInView,
      setPlansInView,
    };
  }, [
    tiers,
    quantities,
    bumpQty,
    addTier,
    switchToId,
    confirmSwitch,
    cancelSwitch,
    clear,
    open,
    setOpen,
    plansInView,
  ]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

/** The currency of whatever is in the cart, or `fallback` when it is empty. */
function cartCurrency(
  tiers: CartTier[],
  quantities: Record<string, number>,
  fallback: Currency,
): Currency {
  return tiers.find((t) => (quantities[t.id] ?? 0) > 0)?.currency ?? fallback;
}
