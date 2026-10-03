"use client";

import { useState } from "react";

import { HEARD_ABOUT_OPTIONS } from "@/lib/registration-days";

/**
 * "How did you hear about the event?" — the same list door registration asks, so the answers
 * count side by side (orders, ticket_requests, registrations; each CHECK-constrained). Used
 * by checkout and the ticket request form, which read it by name. The phone's
 * own picker; "Other" adds an optional line for where.
 */
export function HeardAboutField({ error }: { error?: string }) {
  const [choice, setChoice] = useState("");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label htmlFor="heardAbout" className="block text-[0.8125rem] font-medium">
          How did you hear about the event?
        </label>
        <select
          id="heardAbout"
          name="heardAbout"
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "heardAbout-error" : undefined}
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className={`mt-1.5 w-full appearance-none border border-border bg-card bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat px-3 py-3 pr-10 text-base focus-visible:border-cta focus-visible:outline-none ${
            choice ? "" : "text-muted-foreground"
          }`}
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23a59cb3' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
          }}
        >
          <option value="" disabled>
            Choose one
          </option>
          {HEARD_ABOUT_OPTIONS.map((option) => (
            <option key={option} value={option} className="text-foreground">
              {option}
            </option>
          ))}
        </select>
        {error ? (
          <p id="heardAbout-error" className="mt-1.5 text-[0.8125rem] font-medium text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      {choice === "Other" ? (
        <div>
          <label htmlFor="heardAboutOther" className="block text-[0.8125rem] font-medium">
            Where did you hear about it? (optional)
          </label>
          <input
            id="heardAboutOther"
            name="heardAboutOther"
            maxLength={200}
            autoCapitalize="sentences"
            className="mt-1.5 w-full border border-border bg-card px-3 py-3 text-base focus-visible:border-cta focus-visible:outline-none"
          />
        </div>
      ) : null}
    </div>
  );
}
