"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { KeyRoundIcon, ScanLineIcon, ShieldIcon, UserPlusIcon } from "lucide-react";
import { cn } from "cn";

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
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { CopyButton } from "../share/copy-button";
import { createStaffAccount, removeStaffAccount, type StaffState } from "./actions";

const initial: StaffState = { error: null, created: null };

const ROLES = [
  {
    value: "staff",
    label: "Door staff",
    icon: ScanLineIcon,
    help: "Scans tickets and looks them up at the gate.",
  },
  {
    value: "admin",
    label: "Admin",
    icon: ShieldIcon,
    help: "Everything, including buyers, revenue and staff.",
  },
] as const;

/**
 * Adding someone, in a side sheet like the tier editor.
 *
 * The sheet has two states: the form, then the new account's password. The password is
 * generated server-side and never stored, so this is the only time anyone sees it; the
 * sheet says so and puts a copy button beside it. Reopening starts a fresh form.
 */
export function AddStaffSheet() {
  const [open, setOpen] = useState(false);
  // A new key per opening remounts the form, clearing the last account's password.
  const [session, setSession] = useState(0);

  return (
    <>
      <Button
        onClick={() => {
          setSession((n) => n + 1);
          setOpen(true);
        }}
      >
        <UserPlusIcon data-icon="inline-start" />
        Add someone
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full data-[side=right]:sm:max-w-md">
          <AddStaffForm key={session} onDone={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}

function AddStaffForm({ onDone }: { onDone: () => void }) {
  const [state, action] = useActionState(createStaffAccount, initial);
  const [role, setRole] = useState<"staff" | "admin">("staff");

  if (state.created) {
    return (
      <>
        <SheetHeader className="border-b">
          <SheetTitle>Account created</SheetTitle>
          <SheetDescription>
            Send these to them directly and have them sign in before event night.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-4">
          <div className="flex flex-col gap-1.5">
            <p className="text-muted-foreground text-xs font-medium">Email</p>
            <p className="bg-muted rounded-md px-3 py-2 font-mono text-sm break-all">
              {state.created.email}
            </p>
            <div>
              <CopyButton value={state.created.email} label="Copy email" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-muted-foreground text-xs font-medium">Password</p>
            <p className="bg-muted rounded-md px-3 py-2 font-mono text-sm break-all">
              {state.created.password}
            </p>
            <div>
              <CopyButton value={state.created.password} label="Copy password" />
            </div>
          </div>

          <p className="border-warning/40 bg-warning/10 flex gap-2.5 rounded-lg border p-3 text-sm">
            <KeyRoundIcon className="text-warning mt-0.5 size-4 shrink-0" />
            <span>
              This password is not stored anywhere and cannot be shown again. Copy it
              before closing.
            </span>
          </p>
        </div>

        <div className="border-t p-4">
          <Button className="w-full" onClick={onDone}>
            Done
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <SheetHeader className="border-b">
        <SheetTitle>Add someone</SheetTitle>
        <SheetDescription>
          A password is generated for them and shown once, here.
        </SheetDescription>
      </SheetHeader>

      <form action={action} className="flex min-h-0 flex-1 flex-col">
        <input type="hidden" name="role" value={role} />

        <div className="flex-1 overflow-y-auto px-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="fullName">Name</FieldLabel>
              <Input id="fullName" name="fullName" autoComplete="off" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" name="email" type="email" autoComplete="off" required />
            </Field>

            <FieldSet>
              <FieldLegend variant="label">Role</FieldLegend>
              <div className="grid gap-3" role="radiogroup">
                {ROLES.map((r) => (
                  <label
                    key={r.value}
                    className={cn(
                      "hover:bg-muted/50 has-focus-visible:ring-ring/50 flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors has-focus-visible:ring-[3px]",
                      role === r.value && "border-primary bg-primary/5 hover:bg-primary/10",
                    )}
                  >
                    <input
                      type="radio"
                      name="roleChoice"
                      value={r.value}
                      checked={role === r.value}
                      onChange={() => setRole(r.value)}
                      className="accent-primary mt-1 size-4"
                    />
                    <r.icon className="text-muted-foreground mt-0.5 size-5 shrink-0" />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">{r.label}</span>
                      <span className="text-muted-foreground text-xs">{r.help}</span>
                    </span>
                  </label>
                ))}
              </div>
            </FieldSet>
          </FieldGroup>
        </div>

        <div className="flex flex-col gap-3 border-t p-4">
          {state.error ? (
            <p role="alert" className="text-destructive text-sm font-medium">
              {state.error}
            </p>
          ) : null}
          <CreateSubmit />
        </div>
      </form>
    </>
  );
}

function CreateSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {pending ? "Creating…" : "Create account"}
    </Button>
  );
}

/**
 * Remove, behind a question. It deletes the account outright — not a deactivation — so
 * one stray click used to cost someone their access with no way back but re-creating
 * them. Cancel takes focus when the dialog opens.
 */
export function RemoveStaffButton({ id, name }: { id: string; name: string }) {
  const [state, action] = useActionState(removeStaffAccount, initial);
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button variant="ghost" size="sm" className="text-muted-foreground" />}
      >
        Remove
      </AlertDialogTrigger>
      <AlertDialogContent initialFocus={cancelRef}>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Their account is deleted and they are signed out everywhere. This cannot be
            undone; to give them access again you would create a new account.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {state.error ? (
          <p role="alert" className="text-destructive text-sm font-medium">
            {state.error}
          </p>
        ) : null}
        <form action={action}>
          <input type="hidden" name="id" value={id} />
          <AlertDialogFooter>
            <AlertDialogCancel ref={cancelRef}>Keep</AlertDialogCancel>
            <RemoveSubmit />
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RemoveSubmit() {
  const { pending } = useFormStatus();
  return (
    <AlertDialogAction type="submit" variant="destructive" disabled={pending}>
      {pending ? <Spinner data-icon="inline-start" /> : null}
      {pending ? "Removing…" : "Remove"}
    </AlertDialogAction>
  );
}
