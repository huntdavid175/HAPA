/**
 * The three nights guests register for at the door. Each has its own form and its own
 * URL, so each can have its own QR code on the door that night.
 *
 * The day colour tells staff at a glance which night's form a phone is showing: the pass's
 * tab, stamp and focused line all read `--day`, which `accentClass` sets (globals.css).
 */
export type RegistrationDay = {
  slug: string;
  number: 1 | 2 | 3;
  name: string;
  /** A second line under the name, when the night has one. */
  subtitle: string | null;
  accentClass: string;
};

export const REGISTRATION_DAYS: RegistrationDay[] = [
  {
    slug: "day-1",
    number: 1,
    name: "African Showcase",
    subtitle: null,
    accentClass: "reg-day-1",
  },
  {
    slug: "day-2",
    number: 2,
    name: "Creators Night",
    subtitle: null,
    accentClass: "reg-day-2",
  },
  {
    slug: "day-3",
    number: 3,
    name: "The King of the Diaspora",
    subtitle: "Kings Night",
    accentClass: "reg-day-3",
  },
];

export function getRegistrationDay(slug: string): RegistrationDay | null {
  return REGISTRATION_DAYS.find((day) => day.slug === slug) ?? null;
}

/**
 * "How did you hear about the event?" The backend should accept only these values, so
 * the answers can be counted rather than read one by one. "Other" comes with a free-text
 * line, which is optional.
 */
export const HEARD_ABOUT_OPTIONS = [
  "Instagram",
  "TikTok",
  "X (Twitter)",
  "Facebook",
  "WhatsApp",
  "Friend or family",
  "Poster or flyer",
  "Radio or TV",
  "Other",
] as const;

export type HeardAbout = (typeof HEARD_ABOUT_OPTIONS)[number];
