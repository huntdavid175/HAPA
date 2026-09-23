import * as React from "react"

const MOBILE_BREAKPOINT = 768
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

/**
 * Local edit to the generated hook.
 *
 * Upstream reads the media query inside an effect and calls `setState`, which the
 * project's lint rules reject and which costs an extra render on every mount. A media
 * query is an external store, so this subscribes to it directly. The server snapshot is
 * `false` because the sidebar renders expanded by default, and matching that keeps
 * hydration quiet.
 */
function subscribe(onStoreChange: () => void) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener("change", onStoreChange)
  return () => mql.removeEventListener("change", onStoreChange)
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false
  )
}
