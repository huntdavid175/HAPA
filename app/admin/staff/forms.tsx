"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { createStaffAccount, removeStaffAccount, type StaffState } from "./actions";

const initial: StaffState = { error: null, created: null };

const field = "mt-1 w-full rounded-lg border border-border bg-card px-3 py-2.5 text-base";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
    >
      {pending ? "Creating…" : label}
    </button>
  );
}

export function CreateStaffForm() {
  const [state, action] = useActionState(createStaffAccount, initial);

  return (
    <div>
      <form action={action} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium">Name</label>
            <input id="fullName" name="fullName" required className={field} />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium">Email</label>
            <input id="email" name="email" type="email" required className={field} />
          </div>
        </div>

        <div>
          <label htmlFor="role" className="block text-sm font-medium">Role</label>
          <select id="role" name="role" defaultValue="staff" className={field}>
            <option value="staff">Door staff — scan and look up tickets only</option>
            <option value="admin">Admin — full access to buyers and revenue</option>
          </select>
        </div>

        {state.error ? (
          <p role="alert" className="text-sm font-medium text-destructive">{state.error}</p>
        ) : null}

        <Submit label="Create account" />
      </form>

      {state.created ? (
        <div className="mt-5 rounded-xl border border-success/40 bg-card p-4">
          <p className="text-sm font-semibold text-success">Account created</p>
          <p className="mt-2 text-sm">
            <span className="text-muted-foreground">Email:</span>{" "}
            <span className="font-mono">{state.created.email}</span>
          </p>
          <p className="mt-1 text-sm">
            <span className="text-muted-foreground">Password:</span>{" "}
            <span className="font-mono break-all">{state.created.password}</span>
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Copy this now — it is not stored anywhere and cannot be shown again. Send it to
            them directly, and have them sign in before event night.
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function RemoveStaffButton({ id, name }: { id: string; name: string }) {
  const [state, action] = useActionState(removeStaffAccount, initial);

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="text-sm text-muted-foreground underline hover:text-foreground"
        aria-label={`Remove ${name}`}
      >
        Remove
      </button>
      {state.error ? (
        <span role="alert" className="text-xs text-destructive">{state.error}</span>
      ) : null}
    </form>
  );
}
