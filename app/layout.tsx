import type { Metadata, Viewport } from "next";
import { Archivo, Geist_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

/**
 * One family, two voices.
 *
 * Archivo is variable on both weight and width, so the poster-sized event title can run
 * heavy and expanded while the body text stays at normal width — the contrast a display
 * face usually provides, without a second font to download. That matters here: buyers
 * open this on mobile data, often on the walk to the venue.
 */
const archivo = Archivo({
  variable: "--font-sans",
  subsets: ["latin"],
  axes: ["wdth"],
});

// Kept for ticket codes only. At the gate someone reads a code aloud off a cracked
// screen, and a mono face is what keeps 0 from O and 1 from l.
const geistMono = Geist_Mono({
  variable: "--font-code",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Tickets", template: "%s · Tickets" },
  description: "Buy your ticket and get it by email. Nothing to print.",
};

// Buyers are almost entirely on phones, and many will open this from a QR code.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  /**
   * Shrink the layout viewport when the software keyboard opens, rather than letting the
   * keyboard sit over the page.
   *
   * The checkout form lives in a bottom sheet pinned to the bottom of that viewport. The
   * default (`resizes-visual`) leaves the sheet's lower half — the email field and the
   * pay button — underneath the keyboard, and the browser's own scroll-into-view cannot
   * help because it scrolls the page while the sheet is `position: fixed`.
   *
   * Android Chrome honours this. iOS Safari ignores it entirely, which is why the drawer
   * also carries Base UI's `VirtualKeyboardProvider` — that one measures the visual
   * viewport directly and works everywhere.
   */
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn("h-full antialiased font-sans", archivo.variable, geistMono.variable)}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
