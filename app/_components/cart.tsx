"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

export type CartTier = {
  id: string;
  name: string;
  description: string;
  benefits: string[];
  pricePesewas: number;
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
  clear: () => void;
  ticketCount: number;
  totalPesewas: number;
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
  const [open, setOpen] = useState(false);
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
        const current = prev[tierId] ?? 0;
        return { ...prev, [tierId]: Math.max(0, Math.min(current + delta, ceiling)) };
      });
    },
    [tiers],
  );

  const clear = useCallback(() => setQuantities({}), []);

  const value = useMemo<CartValue>(() => {
    const items = Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([tier_id, quantity]) => ({ tier_id, quantity }));

    return {
      tiers,
      quantities,
      bumpQty,
      clear,
      items,
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
  }, [tiers, quantities, bumpQty, clear, open, plansInView]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
