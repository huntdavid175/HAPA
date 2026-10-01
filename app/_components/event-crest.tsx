import Image from "next/image";

/**
 * The HAPA crest, above the event name on the ticket and registration pages — the first
 * thing under the cover, the way a crest heads an invitation.
 *
 * The source came as gold on solid black; `public/brand/crest.png` has the black turned
 * into transparency (alpha from brightness, so the gold's soft edges survive), so it
 * sits on the plum page without a black box. Decorative: the event name is the heading
 * right beneath it.
 */
export function EventCrest({ className = "" }: { className?: string }) {
  return (
    <Image
      src="/brand/crest.png"
      alt=""
      width={192}
      height={153}
      priority
      className={`h-14 w-auto sm:h-16 ${className}`}
    />
  );
}
