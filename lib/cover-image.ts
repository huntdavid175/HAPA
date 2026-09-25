import { clientEnv } from "@/lib/env";

/**
 * Event covers live in the public `event-covers` Storage bucket
 * (`supabase/migrations/…_event_cover_storage.sql`). The bucket enforces the same size and
 * type limits; these copies let the form say no before a byte is sent.
 */
export const COVER_BUCKET = "event-covers";

export const COVER_MAX_BYTES = 5 * 1024 * 1024;

/** Accepted types, and the extension each is stored under. */
export const COVER_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
} as const;

export type CoverType = keyof typeof COVER_TYPES;

export function isCoverType(type: string): type is CoverType {
  return Object.hasOwn(COVER_TYPES, type);
}

/** The public URL prefix every object in the bucket is served under. */
export function coverUrlPrefix(): string {
  const base = clientEnv().NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/${COVER_BUCKET}/`;
}

/** The object path inside the bucket, or null for a URL that is not one of ours. */
export function coverPathFromUrl(url: string): string | null {
  const prefix = coverUrlPrefix();
  if (!url.startsWith(prefix)) return null;
  const path = url.slice(prefix.length);
  // Only the flat `<uuid>.<ext>` names createCoverUpload issues.
  return /^[0-9a-f-]{36}\.[a-z]+$/.test(path) ? path : null;
}
