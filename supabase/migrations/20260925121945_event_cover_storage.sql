-- =====================================================================================
-- Event cover images live in Supabase Storage.
--
-- The bucket is public: the cover is the first thing a buyer sees and what a WhatsApp
-- link preview shows, so it is served from its public URL with no token and no RLS.
-- Public only means "readable by URL" — with no SELECT policy on storage.objects nobody
-- can list the bucket.
--
-- There are deliberately no INSERT/UPDATE/DELETE policies either. Uploads go through a
-- signed upload URL that a server action issues after `requireAdmin()` (lib/auth.ts), so
-- authorization stays in one place, and the browser never holds a key that could write
-- here on its own.
--
-- The size and type limits are enforced by Storage itself, on signed uploads too, so a
-- tampered client cannot park a 200 MB file or an HTML page on our domain.
-- =====================================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-covers',
  'event-covers',
  true,
  5 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
