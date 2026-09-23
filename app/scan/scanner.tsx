"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

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

export function Scanner({ eventName }: { eventName: string }) {
  const [tab, setTab] = useState<Tab>("scan");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = useCallback((value: string) => {
    startTransition(async () => {
      const outcome = await checkInTicket(value);
      setResult(outcome);
      // A short buzz means staff do not have to look at the screen for every guest.
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(outcome.outcome === "valid" ? 60 : [40, 60, 40]);
      }
    });
  }, []);

  return (
    <div className="mx-auto w-full max-w-md px-4 py-4">
      <h1 className="text-lg font-bold">{eventName}</h1>

      <div className="mt-3 grid grid-cols-2 gap-2" role="tablist">
        <TabButton active={tab === "scan"} onClick={() => setTab("scan")}>
          Scan
        </TabButton>
        <TabButton active={tab === "lookup"} onClick={() => setTab("lookup")}>
          Look up
        </TabButton>
      </div>

      {result ? (
        <ResultBanner result={result} onDismiss={() => setResult(null)} />
      ) : null}

      <div className="mt-4">
        {tab === "scan" ? (
          <ScanTab onDetect={submit} busy={pending} />
        ) : (
          <LookupTab onCheckIn={submit} busy={pending} />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-lg px-3 py-2.5 text-sm font-semibold ${
        active ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function ResultBanner({
  result,
  onDismiss,
}: {
  result: ScanResult;
  onDismiss: () => void;
}) {
  const tone =
    result.outcome === "valid"
      ? "border-success bg-success/15"
      : result.outcome === "already_used"
        ? "border-warning bg-warning/15"
        : "border-destructive bg-destructive/15";

  const heading =
    result.outcome === "valid"
      ? "VALID"
      : result.outcome === "already_used"
        ? "ALREADY USED"
        : result.outcome === "void"
          ? "CANCELLED"
          : "INVALID";

  return (
    <div className={`mt-4 rounded-xl border-2 p-4 ${tone}`} role="status" aria-live="assertive">
      <div className="flex items-start justify-between gap-3">
        <p className="text-2xl font-extrabold tracking-tight">{heading}</p>
        <button type="button" onClick={onDismiss} className="text-sm text-muted-foreground underline">
          Clear
        </button>
      </div>

      {result.buyerName ? (
        <p className="mt-1 text-lg font-semibold">{result.buyerName}</p>
      ) : null}
      <p className="text-sm">
        {[result.tierName, result.code].filter(Boolean).join(" · ")}
      </p>
      <p className="mt-2 text-sm">{result.message}</p>
      {result.outcome === "already_used" && result.checkedInAt ? (
        <p className="text-sm">
          Checked in at {new Date(result.checkedInAt).toLocaleTimeString()}
        </p>
      ) : null}
    </div>
  );
}

function ScanTab({
  onDetect,
  busy,
}: {
  onDetect: (value: string) => void;
  busy: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"idle" | "running" | "unsupported" | "denied">("idle");
  const lastValue = useRef<{ value: string; at: number } | null>(null);

  useEffect(() => {
    if (!window.BarcodeDetector) {
      setStatus("unsupported");
      return;
    }

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
        setStatus("running");
        tick();
      } catch {
        setStatus("denied");
      }
    }

    async function tick() {
      if (stopped || !videoRef.current) return;
      try {
        const codes = await detector.detect(videoRef.current);
        const value = codes[0]?.rawValue;
        // The camera sees the same code many times a second. Ignore repeats within 3s so
        // one guest is not submitted a dozen times.
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
      raf = requestAnimationFrame(tick);
    }

    start();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onDetect]);

  if (status === "unsupported" || status === "denied") {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-medium">
          {status === "denied"
            ? "Camera permission was refused."
            : "This browser cannot scan QR codes."}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Use the <strong>Look up</strong> tab and type the code on the guest&rsquo;s
          ticket. It works exactly the same.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border border-border bg-black">
        <video
          ref={videoRef}
          className="aspect-square w-full object-cover"
          muted
          playsInline
        />
        <div className="pointer-events-none absolute inset-8 rounded-lg border-2 border-white/70" />
      </div>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        {busy ? "Checking…" : "Point the camera at the ticket QR"}
      </p>
    </div>
  );
}

function LookupTab({
  onCheckIn,
  busy,
}: {
  onCheckIn: (value: string) => void;
  busy: boolean;
}) {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<LookupMatch[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setMatches([]);
      return;
    }
    setSearching(true);
    // Debounced: staff type on a phone keyboard, one request per keystroke is wasteful.
    const timer = setTimeout(async () => {
      try {
        setMatches(await lookupTickets(query));
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div>
      <label htmlFor="lookup" className="block text-sm font-medium">
        Ticket code or guest name
      </label>
      <input
        id="lookup"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="GHX-4F7K or Ama"
        autoCapitalize="characters"
        autoComplete="off"
        className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-3 font-mono text-base"
      />

      {searching ? <p className="mt-2 text-sm text-muted-foreground">Searching…</p> : null}

      {!searching && query.trim().length >= 2 && matches.length === 0 ? (
        <p className="mt-3 rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
          No match. Check the spelling, or ask the guest to show the code on their phone.
        </p>
      ) : null}

      <ul className="mt-3 space-y-2">
        {matches.map((match) => (
          <li
            key={match.ticketId}
            className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{match.buyerName}</p>
              <p className="text-sm text-muted-foreground">
                <span className="font-mono">{match.code}</span> · {match.tierName}
              </p>
              {match.status === "checked_in" ? (
                <p className="text-xs text-warning">Already checked in</p>
              ) : match.status === "void" ? (
                <p className="text-xs text-destructive">Cancelled</p>
              ) : null}
            </div>
            <button
              type="button"
              disabled={busy || match.status !== "issued"}
              onClick={() => onCheckIn(match.code)}
              className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-40"
            >
              Check in
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
