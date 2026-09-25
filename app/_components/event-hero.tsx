import { ShareButton } from "./share-button";
import { BackButton } from "./back-button";

/**
 * The stub at the top of the ticket — when there is a stub to show.
 *
 * With a cover image this is a tall photo band with a torn edge beneath it. Without one
 * it collapses to a control strip, and the poster-sized title below becomes the top of
 * the page instead. A 400px field of flat colour is not a design, it is a hole, and most
 * events will be published before anyone gets round to uploading artwork.
 *
 * New covers are uploaded to the `event-covers` bucket, but one set by URL before uploads
 * existed may point at any host. That rules out `next/image`, which refuses any host not
 * listed in `remotePatterns` and would turn it into a 500 on the buyer's first screen.
 */
export function EventHero({
  src,
  eventName,
}: {
  src: string | null;
  eventName: string;
}) {
  const controls = (
    <div className="flex items-center justify-between">
      <BackButton onImage={Boolean(src)} />
      <ShareButton eventName={eventName} onImage={Boolean(src)} />
    </div>
  );

  if (!src) {
    return <div className="px-6 pt-5 sm:px-8">{controls}</div>;
  }

  return (
    <div className="relative isolate">
      <div className="relative aspect-4/5 max-h-[400px] w-full overflow-hidden bg-card sm:aspect-16/9">
        {/* A blown-up, blurred copy fills the frame so a portrait poster does not sit in
            dead bars. Same URL, so the browser downloads it once. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- see the note above */}
        <img
          src={src}
          alt=""
          aria-hidden
          className="absolute inset-0 size-full scale-110 object-cover opacity-45 blur-2xl"
        />

        {/* `contain`, not `cover`: event covers are nearly always posters, and they carry
            the name, the dates and the venue in the artwork itself. Cropping one to a
            landscape band cuts exactly that off. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- see the note above */}
        <img
          src={src}
          // Decorative: the event name is the <h1> directly beneath it, so alt text here
          // would only repeat it for screen readers.
          alt=""
          className="absolute inset-0 size-full object-contain"
          loading="eager"
          fetchPriority="high"
        />

        {/* Keeps the round controls legible over a bright photo. */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-24 bg-linear-to-b from-black/50 to-transparent"
        />
      </div>

      <div className="absolute inset-x-4 top-4 sm:inset-x-5 sm:top-5">{controls}</div>

      {/* The tear only exists where there is something to tear from. */}
      <div className="px-6 sm:px-8">
        <div className="tear" />
      </div>
    </div>
  );
}
