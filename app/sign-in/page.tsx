import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getViewer } from "@/lib/auth";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  // Next 16: searchParams is a Promise.
  const { next } = await searchParams;
  const nextPath = typeof next === "string" ? next : undefined;

  // Already signed in? Send them where they belong rather than showing a dead form.
  const viewer = await getViewer();
  if (viewer) redirect(viewer.role === "admin" ? "/admin" : "/scan");

  return (
    <main className="mx-auto flex w-full max-w-sm flex-col px-4 py-16 sm:py-24">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <p className="mt-2 text-sm text-muted">
        Organizer and door staff only. There is no public sign-up.
      </p>

      <SignInForm next={nextPath} />
    </main>
  );
}
