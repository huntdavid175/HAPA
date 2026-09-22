import { type NextRequest } from "next/server";

import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { eventUrl, qrPng, qrSvgFile } from "@/lib/share";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Downloadable QR for print.
 *
 * Route handlers are not covered by the admin layout, so the role check is repeated here
 * — same reasoning as the CSV export. The encoded URL is public, but an open
 * image-generation endpoint is still not something to hand out.
 */
export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer || viewer.role !== "admin") {
    return new Response("Not found", { status: 404 });
  }

  const format = request.nextUrl.searchParams.get("format") === "svg" ? "svg" : "png";
  const slug = request.nextUrl.searchParams.get("slug");

  const supabase = await createClient();
  const { data: event } = slug
    ? await supabase.from("events").select("slug").eq("slug", slug).maybeSingle()
    : await supabase
        .from("events")
        .select("slug")
        .not("status", "eq", "archived")
        .order("starts_at", { ascending: true })
        .limit(1)
        .maybeSingle();

  if (!event) return new Response("No event", { status: 404 });

  const url = eventUrl(event.slug);
  const filename = `${event.slug}-qr.${format}`;

  if (format === "svg") {
    return new Response(await qrSvgFile(url), {
      headers: {
        "Content-Type": "image/svg+xml",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const png = await qrPng(url);
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
