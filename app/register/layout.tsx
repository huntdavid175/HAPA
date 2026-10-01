/**
 * Both registration pages share the night palette and the kente backdrop. The backdrop is
 * its own fixed layer behind the content, so it stays put while the form scrolls.
 */
export default function RegisterLayout({ children }: LayoutProps<"/register">) {
  return (
    <div className="theme-night relative isolate min-h-dvh text-foreground">
      <div aria-hidden className="reg-backdrop fixed inset-0 -z-10" />
      {children}
    </div>
  );
}
