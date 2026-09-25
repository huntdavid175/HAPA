"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { LogOutIcon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * Sign out, asked first. A volunteer signed out mid-queue has to find someone with the
 * password before the next guest gets in, so one stray tap should not do it.
 */
export function GateSignOut({ signOutAction }: { signOutAction: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="ghost" size="sm" />}>
        <LogOutIcon data-icon="inline-start" />
        Sign out
      </AlertDialogTrigger>
      <AlertDialogContent initialFocus={cancelRef}>
        <AlertDialogHeader>
          <AlertDialogTitle>Sign out of the gate?</AlertDialogTitle>
          <AlertDialogDescription>
            Nobody can be checked in on this phone until someone signs back in.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form action={signOutAction}>
          <AlertDialogFooter>
            <AlertDialogCancel ref={cancelRef}>Keep scanning</AlertDialogCancel>
            <Confirm />
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function Confirm() {
  const { pending } = useFormStatus();
  return (
    <AlertDialogAction type="submit" variant="destructive" disabled={pending}>
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {pending ? "Signing out…" : "Sign out"}
    </AlertDialogAction>
  );
}
