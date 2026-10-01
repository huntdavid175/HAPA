/**
 * The registration pages share the ticket page's night palette, pinned dark whatever the
 * device prefers, so the two read as one site.
 */
export default function RegisterLayout({ children }: LayoutProps<"/register">) {
  return (
    <div className="theme-night min-h-dvh bg-background text-foreground">{children}</div>
  );
}
