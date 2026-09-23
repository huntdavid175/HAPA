"use client";

import { useEffect, useState } from "react";

/**
 * Whether an element is currently on screen.
 *
 * Used to get the buy panel out of the way once the pricing cards are visible: at that
 * point the cards carry their own buttons, and a floating bar repeating the same offer is
 * just covering the thing the buyer came to read.
 *
 * `IntersectionObserver` rather than a scroll listener — it does not fire on every frame
 * and it keeps working when the page is resized or content above it reflows.
 */
export function useInView(ref: React.RefObject<HTMLElement | null>, rootMargin = "0px") {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, rootMargin]);

  return inView;
}
