"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  CameraOffIcon,
  CheckIcon,
  CircleAlertIcon,
  ClockIcon,
  KeyboardIcon,
  ScanLineIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  checkInTicket,
  lookupTickets,
  type LookupMatch,
  type ScanResult,
} from "./actions";

/**
 * `BarcodeDetector` is available in Chrome on Android, which covers most phones handed
 * to gate staff in Ghana. Everything else falls back to typing the short code — that path
 * has to be good anyway, because it is what gets used when a buyer's phone is dead.
 */
declare global {
  interface Window {
    BarcodeDetector?: {
      new (options?: { formats?: string[] }): {
        detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
      };
      getSupportedFormats?(): Promise<string[]>;
    };
  }
}

type Tab = "scan" | "lookup";

/** How long a green result stays before the scanner is ready for the next guest. */
const VALID_HOLD_MS = 2500;

/**
 * The gate.
 *
 * Built for one hand, a dark room and a queue. The result is the whole design: it takes
 * over the screen in its colour so it reads at arm's length and from the corner of an
 * eye. Green clears itself so a flowing queue needs no taps; amber and red stay until
 * someone deals with the guest in front of them.
 */
export function Scanner({
  eventName,
  issued,
  checkedIn,
  timezone,
}: {
  eventName: string;
  issued: number;
  checkedIn: number;
  timezone: string;
}) {
  const [tab, setTab] = useState<Tab>("scan");
  const [result, setResult] = useState<ScanResult | null>(null);
  // Bumped whenever a result closes, so an open Look up list fetches again and the guest
  // just let in shows as checked in, with their button disabled.
  const [refreshToken, setRefreshToken] = useState(0);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const submit = useCallback((value: string) => {
    startTransition(async () => {
      const outcome = await checkInTicket(value);
      setResult(outcome);
      // The count comes from the server, not a local tally: with two phones at two doors,
      // each should show the gate's total, not only its own scans.
      if (outcome.outcome === "valid") router.refresh();
      // A short buzz means staff do not have to look at the screen for every guest.
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(outcome.outcome === "valid" ? 60 : [40, 60, 40]);
      }
    });
  }, [router]);

  // Stable, so the green screen's auto-dismiss timer is not restarted by every render.
  const dismiss = useCallback(() => {
    setResult(null);
    setRefreshToken((n) => n + 1);
    router.refresh();
  }, [router]);

  const pct = issued ? Math.min(100, (checkedIn / issued) * 100) : 0;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pt-4">
      <header className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="min-w-0 truncate text-base font-semibold">{eventName}</h1>
          <p className="shrink-0 text-sm tabular-nums">
            <span className="text-lg font-semibold">{checkedIn.toLocaleString()}</span>
            <span className="text-muted-foreground"> of {issued.toLocaleString()} in</span>
          </p>
        </div>
        <div
          role="progressbar"
          aria-label={`${checkedIn} of ${issued} guests checked in`}
          aria-valuemin={0}
          aria-valuemax={issued}
          aria-valuenow={checkedIn}
          className="bg-muted h-1.5 overflow-hidden rounded-full"
        >
          <div
            className="bg-success h-full rounded-full transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </header>

      <div role="tablist" className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
        <TabButton active={tab === "scan"} onClick={() => setTab("scan")} icon={ScanLineIcon}>
          Scan
        </TabButton>
        <TabButton active={tab === "lookup"} onClick={() => setTab("lookup")} icon={SearchIcon}>
          Look up
        </TabButton>
      </div>

      {tab === "scan" ? (
        <ScanTab onDetect={submit} busy={pending} paused={result !== null} />
      ) : (
        <LookupTab onCheckIn={submit} busy={pending} refreshToken={refreshToken} />
      )}

      {result ? (
        <ResultScreen
          result={result}
          timezone={timezone}
          onDismiss={dismiss}
        />
      ) : null}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "focus-visible:ring-ring/50 flex h-10 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors outline-none focus-visible:ring-[3px]",
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
      )}
    >
      <Icon className="size-4" />
      {children}
    </button>
  );
}

const RESULT_LOOK = {
  valid: {
    heading: "Let them in",
    icon: CheckIcon,
    className: "bg-success",
  },
  already_used: {
    heading: "Already used",
    icon: ClockIcon,
    className: "bg-warning",
  },
  void: {
    heading: "Cancelled ticket",
    icon: XIcon,
    className: "bg-destructive",
  },
  not_found: {
    heading: "Not valid",
    icon: XIcon,
    className: "bg-destructive",
  },
  error: {
    heading: "Could not check",
    icon: CircleAlertIcon,
    className: "bg-destructive",
  },
} as const;

/**
 * The verdict, full screen. `text-background` on a status colour is deliberate: it is
 * white on the dark greens and reds of the light theme and near-black on the brighter
 * ones of the dark theme, so the text holds its contrast in both without new tokens.
 */
function ResultScreen({
  result,
  timezone,
  onDismiss,
}: {
  result: ScanResult;
  timezone: string;
  onDismiss: () => void;
}) {
  const look = RESULT_LOOK[result.outcome];
  const valid = result.outcome === "valid";
  const doneRef = useRef<HTMLButtonElement>(null);

  // Green goes by itself; anything else waits for a person.
  useEffect(() => {
    doneRef.current?.focus();
    if (!valid) return;
    const timer = setTimeout(onDismiss, VALID_HOLD_MS);
    return () => clearTimeout(timer);
  }, [valid, onDismiss]);

  const usedAt =
    result.outcome === "already_used" && result.checkedInAt
      ? new Intl.DateTimeFormat("en-GH", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZone: timezone,
        }).format(new Date(result.checkedInAt))
      : null;

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      aria-label={look.heading}
      onClick={onDismiss}
      className={cn(
        "text-background fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 px-6 text-center",
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 duration-150",
        look.className,
      )}
    >
      <span className="bg-background/20 flex size-24 items-center justify-center rounded-full">
        <look.icon className="size-14" strokeWidth={2.5} />
      </span>

      <div className="flex flex-col gap-2">
        <p className="text-4xl font-extrabold tracking-tight">{look.heading}</p>
        {result.buyerName ? (
          <p className="text-2xl font-semibold">{result.buyerName}</p>
        ) : null}
        {result.tierName || result.code ? (
          <p className="text-lg opacity-90">
            {result.tierName}
            {result.tierName && result.code ? ", " : ""}
            {result.code ? <span className="font-mono">{result.code}</span> : null}
          </p>
        ) : null}
        {usedAt ? (
          <p className="mt-2 text-lg font-medium">Scanned in at {usedAt}</p>
        ) : !valid ? (
          <p className="mt-2 text-lg font-medium">{result.message}</p>
        ) : null}
      </div>

      <button
        ref={doneRef}
        type="button"
        onClick={onDismiss}
        className="bg-background/20 hover:bg-background/30 focus-visible:ring-background/60 mt-4 h-14 w-full max-w-xs rounded-xl text-lg font-semibold outline-none focus-visible:ring-4"
      >
        Next guest
      </button>

      {valid ? (
        // How long until the scanner is back. Without it, green that vanishes on its own
        // feels like a glitch.
        <div className="bg-background/25 absolute inset-x-0 bottom-0 h-1.5">
          <div
            className="bg-background/80 h-full"
            style={{ animation: `gate-drain ${VALID_HOLD_MS}ms linear forwards` }}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Read once in the browser; the server renders nothing camera-specific. */
function useCanScan(): boolean | null {
  return useSyncExternalStore(
    () => () => {},
    () => Boolean(window.BarcodeDetector),
    () => null,
  );
}

function ScanTab({
  onDetect,
  busy,
  paused,
}: {
  onDetect: (value: string) => void;
  busy: boolean;
  /** A result is on screen: keep the camera, stop submitting. */
  paused: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canScan = useCanScan();
  const [camera, setCamera] = useState<"starting" | "running" | "denied">("starting");
  const lastValue = useRef<{ value: string; at: number } | null>(null);
  const pausedRef = useRef(paused);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    if (!canScan || !window.BarcodeDetector) return;

    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const detector = new window.BarcodeDetector({ formats: ["qr_code"] });

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (stopped) return;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCamera("running");
        tick();
      } catch {
        setCamera("denied");
      }
    }

    async function tick() {
      if (stopped || !videoRef.current) return;
      if (!pausedRef.current) {
        try {
          const codes = await detector.detect(videoRef.current);
          const value = codes[0]?.rawValue;
          // The camera sees the same code many times a second. Ignore repeats within 3s
          // so one guest is not submitted a dozen times.
          if (value) {
            const now = Date.now();
            const previous = lastValue.current;
            if (!previous || previous.value !== value || now - previous.at > 3000) {
              lastValue.current = { value, at: now };
              onDetect(value);
            }
          }
        } catch {
          // A transient decode failure is normal between frames.
        }
      }
      raf = requestAnimationFrame(tick);
    }

    start();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [canScan, onDetect]);

  if (canScan === null) {
    return <div className="bg-muted aspect-square w-full animate-pulse rounded-2xl" />;
  }

  if (!canScan || camera === "denied") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-8 text-center">
        <span className="bg-muted flex size-12 items-center justify-center rounded-full">
          {camera === "denied" ? (
            <CameraOffIcon className="text-muted-foreground size-6" />
          ) : (
            <KeyboardIcon className="text-muted-foreground size-6" />
          )}
        </span>
        <div className="flex flex-col gap-1">
          <p className="font-medium">
            {camera === "denied" ? "The camera is blocked" : "This browser cannot scan"}
          </p>
          <p className="text-muted-foreground text-sm">
            {camera === "denied"
              ? "Allow camera access for this site in the browser settings, or check guests in by code."
              : "Scanning works in Chrome on Android. Until then, check guests in by code; it works just the same."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-2xl bg-black">
        <video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline />

        {/* Corner brackets rather than a full frame: they show where to aim without
            boxing the ticket in. */}
        <div className="pointer-events-none absolute inset-10">
          <span className="absolute top-0 left-0 size-8 rounded-tl-lg border-t-4 border-l-4 border-white/90" />
          <span className="absolute top-0 right-0 size-8 rounded-tr-lg border-t-4 border-r-4 border-white/90" />
          <span className="absolute bottom-0 left-0 size-8 rounded-bl-lg border-b-4 border-l-4 border-white/90" />
          <span className="absolute right-0 bottom-0 size-8 rounded-br-lg border-r-4 border-b-4 border-white/90" />
          {camera === "running" ? (
            <span className="absolute inset-x-2 top-0 h-0.5 bg-white/70 shadow-[0_0_12px_2px_rgba(255,255,255,0.45)] motion-safe:animate-[gate-sweep_2.2s_ease-in-out_infinite_alternate]" />
          ) : null}
        </div>

        {camera === "starting" ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
            <Spinner className="mr-2" /> Starting camera…
          </div>
        ) : null}
      </div>

      <p className="text-muted-foreground flex h-5 items-center justify-center gap-2 text-sm">
        {busy ? (
          <>
            <Spinner /> Checking…
          </>
        ) : (
          "Hold the ticket QR inside the corners"
        )}
      </p>
    </div>
  );
}

function LookupTab({
  onCheckIn,
  busy,
  refreshToken,
}: {
  onCheckIn: (value: string) => void;
  busy: boolean;
  /** Changes when a check-in result closes: fetch the same search again. */
  refreshToken: number;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ for: string; matches: LookupMatch[] }>({
    for: "",
    matches: [],
  });

  const trimmed = query.trim();
  const active = trimmed.length >= 2;
  // Derived, not stored: the lookup is "searching" until results for this exact text
  // have arrived, which keeps every setState inside the async callback below.
  const searching = active && results.for !== trimmed;
  const matches = active && results.for === trimmed ? results.matches : [];

  useEffect(() => {
    if (!active) return;
    // Debounced: staff type on a phone keyboard, one request per keystroke is wasteful.
    // A refetch after a check-in keeps the old rows on screen until the new ones land,
    // since `for` still matches, so the list updates in place rather than flickering.
    const timer = setTimeout(async () => {
      const found = await lookupTickets(trimmed).catch(() => [] as LookupMatch[]);
      setResults({ for: trimmed, matches: found });
    }, 300);
    return () => clearTimeout(timer);
  }, [active, trimmed, refreshToken]);

  return (
    <div className="flex flex-col gap-3">
      <form
        // Typing a whole code and pressing Enter checks it in directly: the path for a
        // guest whose phone is dead and who reads their code off a screenshot.
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed) onCheckIn(trimmed);
        }}
        className="relative"
      >
        <label htmlFor="lookup" className="sr-only">
          Ticket code or guest name
        </label>
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2" />
        <Input
          id="lookup"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Code or guest name"
          autoCapitalize="characters"
          autoComplete="off"
          enterKeyHint="go"
          className="h-12 pl-11 font-mono text-base"
        />
      </form>
      <p className="text-muted-foreground -mt-1 text-xs">
        Type a name to search, or a full code and press Enter to check it in.
      </p>

      {searching ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Spinner /> Searching…
        </p>
      ) : null}

      {!searching && active && matches.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
          No match. Check the spelling, or ask the guest to show the code on their phone.
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {matches.map((match) => {
          const used = match.status === "checked_in";
          const cancelled = match.status === "void";
          return (
            <li
              key={match.ticketId}
              className="bg-card flex items-center justify-between gap-3 rounded-xl border p-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{match.buyerName}</p>
                <p className="text-muted-foreground truncate text-sm">
                  <span className="font-mono">{match.code}</span>, {match.tierName}
                </p>
                {used ? (
                  <p className="text-warning mt-0.5 text-xs font-medium">Already checked in</p>
                ) : cancelled ? (
                  <p className="text-destructive mt-0.5 text-xs font-medium">Cancelled</p>
                ) : null}
              </div>
              <Button
                size="lg"
                disabled={busy || match.status !== "issued"}
                onClick={() => onCheckIn(match.code)}
                className="shrink-0"
              >
                Check in
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
