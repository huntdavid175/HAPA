"use client";

import { useRef, useState, useTransition } from "react";
import { CheckIcon, ChevronDownIcon, MailIcon } from "lucide-react";
import {
  AsYouType,
  getExampleNumber,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";
import examples from "libphonenumber-js/examples.mobile.json";

import { DEFAULT_PHONE_COUNTRY, phoneCountries } from "@/lib/phone-countries";

import { HEARD_ABOUT_OPTIONS, type RegistrationDay } from "@/lib/registration-days";
import {
  REGISTRATION_LIMITS,
  checkRegistrationPhone,
  validateRegistration,
  type RegistrationErrors as Errors,
  type RegistrationFields as Fields,
} from "@/lib/registration";
import { registerGuest } from "../actions";

// Key order is form order: the first key with an error is the field that gets focus.
const EMPTY: Fields = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  phoneCountry: DEFAULT_PHONE_COUNTRY,
  occupation: "",
  heardAbout: "",
  heardAboutOther: "",
};

export type Registered = Fields & { phoneDisplay: string; alreadyRegistered: boolean };

/**
 * The registration form is a paper pass, the same object guests are sent as a ticket:
 * the night on the stub, a perforation, then the half they fill in. Submitting prints
 * their details onto that half and stamps it, so the form becomes the pass.
 *
 * The form checks everything before sending, so a guest sees every mistake at once; the
 * action checks again and saves (app/register/actions.ts).
 *
 * It opens in a modal from the night's button. Whether the guest has registered is held
 * by the page (`registered` / `onRegistered`), so closing the modal and opening it again
 * shows the stamped pass rather than an empty form.
 */
export function RegistrationPass({
  day,
  registered,
  onRegistered,
}: {
  day: RegistrationDay;
  registered: Registered | null;
  onRegistered: (details: Registered) => void;
}) {
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const passRef = useRef<HTMLElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function update(key: keyof Fields, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
    // Clear a field's error as soon as the guest starts fixing it, not on the next submit.
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function focusFirstError(found: Errors) {
    const first = (Object.keys(EMPTY) as (keyof Fields)[]).find((key) => found[key]);
    if (first) formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
    return Boolean(first);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const found = validateRegistration(fields);
    setErrors(found);
    setFormError(null);
    if (focusFirstError(found)) return;

    startTransition(async () => {
      let result;
      try {
        result = await registerGuest({ daySlug: day.slug, ...fields });
      } catch {
        // The action never reached the server, or threw: most often the venue's signal.
        setFormError("Your registration was not saved. Check your connection and try again.");
        return;
      }

      if (!result.ok) {
        setFormError(result.error);
        if (result.fieldErrors) {
          setErrors(result.fieldErrors);
          focusFirstError(result.fieldErrors);
        }
        return;
      }

      const phone = checkRegistrationPhone(fields.phone, fields.phoneCountry);
      onRegistered({
        ...fields,
        firstName: fields.firstName.trim(),
        lastName: fields.lastName.trim(),
        email: fields.email.trim(),
        occupation: fields.occupation.trim(),
        phoneDisplay: phone.ok ? phone.display : fields.phone,
        alreadyRegistered: result.alreadyRegistered,
      });
      // The modal scrolls on its own; bring the stamped top of the pass into view.
      passRef.current?.scrollIntoView({ block: "start" });
    });
  }

  return (
    <article ref={passRef} className={`scroll-mt-4 ${day.accentClass}`}>
      {/* ---- The stub: which night ------------------------------------------------ */}
      <header className="theme-paper reg-cut-bottom flex rounded-t-[1.75rem] bg-card text-card-foreground">
        <div className="min-w-0 flex-1 px-6 pt-7 pb-7">
          <h2
            id={registrationTitleId(day)}
            className="text-[2rem] leading-[0.95] font-extrabold tracking-[-0.03em] text-balance break-words [font-stretch:112%] min-[400px]:text-[2.375rem]"
          >
            {day.name}
          </h2>
          <p className="mt-4 text-[0.95rem] text-pretty text-muted-foreground">
            {registered
              ? registered.alreadyRegistered
                ? "You were already on the list for this night."
                : "You're on the list for this night."
              : "Fill in your details to register for this night."}
          </p>
        </div>

        {/* The night printed down the edge, the way a wristband colour is the first
            thing a steward looks for. */}
        <span
          className="flex w-11 shrink-0 items-center justify-center rounded-tr-[1.75rem] py-6"
          style={{ background: "var(--day)", color: "var(--day-foreground)" }}
        >
          <span className="rotate-180 text-[0.95rem] font-extrabold tracking-[-0.01em] whitespace-nowrap [writing-mode:vertical-rl]">
            Day {day.number}
          </span>
        </span>
      </header>

      {/* ---- The half the guest fills in, below the tear -------------------------- */}
      {/* The dashed top border is the perforation; the notches are cut through both
          halves (`.reg-cut-*`) so the backdrop shows through them. */}
      <div className="theme-paper reg-cut-top rounded-b-[1.75rem] border-t-2 border-dashed border-border bg-muted text-foreground">
        {registered ? (
          <FilledIn details={registered} />
        ) : (
          <form
            ref={formRef}
            onSubmit={onSubmit}
            noValidate
            className="flex flex-col gap-6 px-6 pt-7 pb-7"
          >
            <div className="grid gap-6 min-[400px]:grid-cols-2 min-[400px]:gap-4">
              <Line
                name="firstName"
                label="First name"
                autoComplete="given-name"
                maxLength={REGISTRATION_LIMITS.name}
                autoCapitalize="words"
                value={fields.firstName}
                error={errors.firstName}
                onChange={update}
              />
              <Line
                name="lastName"
                label="Last name"
                autoComplete="family-name"
                maxLength={REGISTRATION_LIMITS.name}
                autoCapitalize="words"
                value={fields.lastName}
                error={errors.lastName}
                onChange={update}
              />
            </div>

            <Line
              name="email"
              label="Email"
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={REGISTRATION_LIMITS.email}
              autoCapitalize="none"
              spellCheck={false}
              value={fields.email}
              error={errors.email}
              onChange={update}
            />

            <PhoneField
              value={fields.phone}
              country={fields.phoneCountry}
              error={errors.phone}
              onChange={update}
            />

            <Line
              name="occupation"
              label="Occupation"
              autoComplete="organization-title"
              maxLength={REGISTRATION_LIMITS.occupation}
              autoCapitalize="sentences"
              placeholder="e.g. Photographer"
              value={fields.occupation}
              error={errors.occupation}
              onChange={update}
            />

            <div className="flex flex-col gap-4">
              <HeardAboutSelect
                value={fields.heardAbout}
                error={errors.heardAbout}
                onChange={update}
              />
              {fields.heardAbout === "Other" ? (
                <Line
                  name="heardAboutOther"
                  label="Where did you hear about it? (optional)"
                  autoCapitalize="sentences"
                  enterKeyHint="done"
                  maxLength={REGISTRATION_LIMITS.heardAboutOther}
                  value={fields.heardAboutOther}
                  error={errors.heardAboutOther}
                  onChange={update}
                />
              ) : null}
            </div>

            {formError ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                {formError}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={pending}
              aria-disabled={pending}
              className="mt-2 h-13 w-full rounded-xl bg-foreground px-6 text-[0.95rem] font-bold tracking-[-0.01em] text-background transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-[var(--day)] focus-visible:ring-offset-2 focus-visible:ring-offset-muted focus-visible:outline-none disabled:opacity-70"
            >
              {pending ? "Registering…" : "Register"}
            </button>
          </form>
        )}
      </div>
    </article>
  );
}

/** The pass's title, which also names the modal it opens in. */
export function registrationTitleId(day: RegistrationDay): string {
  return `reg-title-${day.slug}`;
}

/** The bottom half once registered: the guest's details, printed and stamped. */
function FilledIn({ details }: { details: Registered }) {
  return (
    <div role="status" className="relative px-6 pt-7 pb-8">
      <span
        className="reg-stamp absolute top-6 right-5 flex items-center gap-1.5 rounded-lg border-[3px] px-2.5 py-1 text-[0.95rem] font-extrabold tracking-[-0.01em]"
        style={{ borderColor: "var(--day)", color: "var(--day)" }}
      >
        <CheckIcon className="size-4" strokeWidth={3.5} />
        Registered
      </span>

      <p className="text-sm font-semibold text-muted-foreground">Guest</p>
      <p className="mt-1 pr-2 text-[1.625rem] leading-[1.05] font-extrabold tracking-[-0.02em] break-words [font-stretch:105%]">
        {details.firstName}
        <br />
        {details.lastName}
      </p>

      <dl className="mt-6 grid gap-4">
        <Printed label="Occupation">{details.occupation}</Printed>
        <Printed label="Email">
          <span className="break-all">{details.email}</span>
        </Printed>
        <Printed label="Phone">{details.phoneDisplay}</Printed>
      </dl>

      {/* Only a new registration is emailed (app/register/actions.ts); a repeat was
          confirmed the first time, so it is pointed back to that email. */}
      <p className="mt-6 flex items-start gap-3 rounded-xl bg-card px-4 py-3.5 text-[0.9375rem] leading-snug text-foreground">
        <MailIcon aria-hidden className="mt-0.5 size-5 shrink-0" style={{ color: "var(--day)" }} />
        <span>
          {details.alreadyRegistered
            ? "Your event details were emailed to you when you first registered. "
            : "We've emailed your event details to you. "}
          <strong className="font-semibold">Check your inbox</strong>, and your spam or
          promotions folder if it isn&apos;t there.
        </span>
      </p>
    </div>
  );
}

function Printed({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 border-b border-foreground/15 pb-3">
      <dt className="text-[0.8125rem] font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-base font-semibold">{children}</dd>
    </div>
  );
}

/**
 * The phone's own picker, not a custom listbox: on a phone it opens the native wheel or
 * sheet, which is the easiest thing to use one-handed in a queue. Drawn as a fill-in line
 * so it sits in the form like every other field. `.theme-paper` sets `color-scheme: light`,
 * so the options the browser draws stay light too.
 */
function HeardAboutSelect({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string;
  onChange: (name: keyof Fields, value: string) => void;
}) {
  const id = "reg-heardAbout";

  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-[0.8125rem] font-semibold text-muted-foreground">
        How did you hear about the event?
      </label>
      <div className="relative">
        <select
          id={id}
          name="heardAbout"
          value={value}
          onChange={(e) => onChange("heardAbout", e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`h-11 w-full min-w-0 appearance-none rounded-none border-0 border-b-2 border-foreground/30 bg-transparent py-0 pr-8 pl-0 text-[1.0625rem] focus-visible:border-[var(--day)] focus-visible:outline-none aria-invalid:border-destructive ${
            value ? "font-semibold text-foreground" : "text-muted-foreground/60"
          }`}
        >
          <option value="" disabled>
            Choose one
          </option>
          {HEARD_ABOUT_OPTIONS.map((option) => (
            <option key={option} value={option} className="font-normal text-foreground">
              {option}
            </option>
          ))}
        </select>
        <ChevronDownIcon
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-0 size-5 -translate-y-1/2 text-muted-foreground"
        />
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-[0.8125rem] font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The phone number, with the guest's country picked beside it: the flag and dial code
 * show, and a native select sits invisibly over them, so a tap opens the phone's own
 * list. Ghana is picked to start with. A number pasted with its own `+1…` code moves the
 * picker to match, so the two never disagree on screen.
 */
function PhoneField({
  value,
  country,
  error,
  onChange,
}: {
  value: string;
  country: string;
  error?: string;
  onChange: (name: keyof Fields, value: string) => void;
}) {
  const id = "reg-phone";
  const { pinned, rest } = phoneCountries();
  const current = [...pinned, ...rest].find((c) => c.code === country) ?? pinned[0];
  // Ghana keeps the way Ghanaians write their own number; elsewhere, the country's own
  // example mobile number, so a guest sees how much to type.
  const placeholder =
    current.code === "GH"
      ? "024 123 4567"
      : (getExampleNumber(current.code, examples)?.formatNational() ?? "");

  function onNumber(next: string) {
    onChange("phone", next);
    const typed = next.replace(/[\s()\-.]/g, "");
    if (typed.startsWith("+") || typed.startsWith("00")) {
      const detected = detectCountry(typed.startsWith("00") ? `+${typed.slice(2)}` : typed);
      if (detected && detected !== country) onChange("phoneCountry", detected);
    }
  }

  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-[0.8125rem] font-semibold text-muted-foreground">
        Phone number
      </label>
      <div className="flex items-end gap-3">
        <div className="relative shrink-0">
          <select
            aria-label="Country"
            name="phoneCountry"
            value={current.code}
            onChange={(e) => onChange("phoneCountry", e.target.value as CountryCode)}
            className="peer absolute inset-0 z-10 w-full cursor-pointer opacity-0"
          >
            <optgroup label="Common">
              {pinned.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.name} (+{c.dial})
                </option>
              ))}
            </optgroup>
            <optgroup label="All countries">
              {rest.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.name} (+{c.dial})
                </option>
              ))}
            </optgroup>
          </select>
          <span
            aria-hidden
            className="flex h-11 items-center gap-1.5 border-b-2 border-foreground/30 pr-1 text-[1.0625rem] font-semibold text-foreground peer-focus-visible:border-[var(--day)]"
          >
            <span className="text-xl leading-none">{current.flag}</span>
            <span className="tabular-nums">+{current.dial}</span>
            <ChevronDownIcon className="size-4 text-muted-foreground" />
          </span>
        </div>

        <input
          id={id}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          enterKeyHint="next"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onNumber(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : `${id}-hint`}
          className="h-11 w-full min-w-0 flex-1 rounded-none border-0 border-b-2 border-foreground/30 bg-transparent px-0 text-[1.0625rem] font-semibold text-foreground placeholder:font-normal placeholder:text-muted-foreground/60 focus-visible:border-[var(--day)] focus-visible:outline-none aria-invalid:border-destructive"
        />
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-[0.8125rem] font-medium text-destructive">
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="mt-1.5 text-[0.8125rem] text-muted-foreground">
          Not a Ghana number? Tap the flag to choose your country.
        </p>
      )}
    </div>
  );
}

/**
 * Which country a number typed with its own `+` code belongs to.
 *
 * Several countries share a code, and the compact number data cannot always tell them
 * apart: a UK mobile parses as Guernsey. So a pinned country wins — the number's own
 * country if it is one (a Toronto number is Canada), else the pinned country with that
 * code (+44 is the UK, +1 the USA). Only the flag depends on this; the number is saved
 * and checked in full either way.
 */
function detectCountry(international: string): CountryCode | undefined {
  const { pinned } = phoneCountries();
  const parsed = parsePhoneNumberFromString(international);
  if (parsed?.isValid() && pinned.some((c) => c.code === parsed.country)) return parsed.country;

  const formatter = new AsYouType();
  formatter.input(international);
  const code = formatter.getCallingCode();
  return pinned.find((c) => c.dial === code)?.code ?? parsed?.country ?? formatter.getCountry();
}

/**
 * A fill-in line, as on a printed form: a label and a rule to write on. The rule turns
 * the night's colour while it has focus, and red with its message when wrong.
 */
function Line({
  name,
  label,
  hint,
  value,
  error,
  onChange,
  ...props
}: {
  name: keyof Fields;
  label: string;
  hint?: string;
  value: string;
  error?: string;
  onChange: (name: keyof Fields, value: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "name" | "value" | "onChange">) {
  const id = `reg-${name}`;
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-[0.8125rem] font-semibold text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        name={name}
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        enterKeyHint={props.enterKeyHint ?? "next"}
        {...props}
        className="h-11 w-full min-w-0 rounded-none border-0 border-b-2 border-foreground/30 bg-transparent px-0 text-[1.0625rem] font-semibold text-foreground placeholder:font-normal placeholder:text-muted-foreground/60 focus-visible:border-[var(--day)] focus-visible:outline-none aria-invalid:border-destructive"
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-[0.8125rem] font-medium text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[0.8125rem] text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
