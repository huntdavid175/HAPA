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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";

/**
 * The account row at the foot of the sidebar, and the question it asks before signing out.
 *
 * It used to be the email address as a submit button: one click anywhere on it and you
 * were out, which on event night means fishing for a password with a queue at the door.
 * Now the row reads as an account (avatar, address, a sign-out mark) and asks first.
 * Cancel takes focus when the dialog opens, so a reflexive Enter keeps you signed in.
 */
export function SignOutDialog({
  email,
  signOutAction,
}: {
  email: string;
  signOutAction: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <SidebarMenuButton size="lg" tooltip="Sign out" className="w-full" />
        }
      >
        <Avatar size="sm" className="rounded-md">
          <AvatarFallback className="rounded-md text-[0.625rem] font-medium">
            {email.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className="flex min-w-0 flex-1 flex-col text-left leading-tight">
          <span className="truncate text-sm font-medium">{email}</span>
          <span className="text-muted-foreground truncate text-xs">Admin</span>
        </span>
        <LogOutIcon className="text-muted-foreground ml-auto" />
      </AlertDialogTrigger>

      <AlertDialogContent initialFocus={cancelRef}>
        <AlertDialogHeader>
          <AlertDialogTitle>Sign out?</AlertDialogTitle>
          <AlertDialogDescription>
            You are signed in as <span className="text-foreground break-all">{email}</span>.
            You will need your password to get back in.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <form action={signOutAction}>
          <AlertDialogFooter>
            <AlertDialogCancel ref={cancelRef}>Stay signed in</AlertDialogCancel>
            <ConfirmButton />
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Inside the form so it can show the round trip, and cannot be pressed twice. */
function ConfirmButton() {
  const { pending } = useFormStatus();
  return (
    <AlertDialogAction type="submit" variant="destructive" disabled={pending}>
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {pending ? "Signing out…" : "Sign out"}
    </AlertDialogAction>
  );
}
