import "server-only";

import QRCode from "qrcode";

import { clientEnv } from "@/lib/env";

/** The public URL for an event — what the QR code encodes and what you share. */
export function eventUrl(slug: string): string {
  return `${clientEnv().NEXT_PUBLIC_SITE_URL}/e/${slug}`;
}

/**
 * QR settings tuned for print rather than screen.
 *
 * Error correction "M" over "L": a poster gets rained on, taped over and photographed at
 * an angle, and M tolerates ~15% damage for only a modest density increase. The quiet
 * zone (margin) is non-negotiable — a QR butted against artwork often will not scan.
 */
const QR_OPTIONS = {
  errorCorrectionLevel: "M" as const,
  margin: 4,
  color: { dark: "#000000", light: "#FFFFFF" },
};

/** Inline SVG for previewing in the dashboard. */
export async function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, { ...QR_OPTIONS, type: "svg", width: 320 });
}

/** SVG file for designers — scales to any poster size without going fuzzy. */
export async function qrSvgFile(url: string): Promise<string> {
  return QRCode.toString(url, { ...QR_OPTIONS, type: "svg", width: 1024 });
}

/**
 * PNG at 1024px. Big enough to print roughly 8cm wide at 300dpi, which is a comfortable
 * scan distance for a poster on a wall.
 */
export async function qrPng(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, { ...QR_OPTIONS, type: "png", width: 1024 });
}
