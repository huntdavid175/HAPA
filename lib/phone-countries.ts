import {
  getCountries,
  getCountryCallingCode,
  isSupportedCountry,
  type CountryCode,
} from "libphonenumber-js";

/**
 * The countries a registration phone number can be from, for the picker beside the field.
 *
 * Every country libphonenumber knows, named in English by the browser (`Intl.DisplayNames`)
 * rather than a hand-kept list. The ones a Kumasi crowd and its diaspora night mostly come
 * from are pinned above the rest, so nobody scrolls past Afghanistan to reach the UK.
 */
export type PhoneCountry = {
  code: CountryCode;
  name: string;
  /** Without the plus: "233". */
  dial: string;
  flag: string;
};

export const DEFAULT_PHONE_COUNTRY: CountryCode = "GH";

const PINNED: CountryCode[] = ["GH", "US", "GB", "CA", "NG", "DE", "NL", "IT"];

let cache: { pinned: PhoneCountry[]; rest: PhoneCountry[] } | undefined;

export function phoneCountries(): { pinned: PhoneCountry[]; rest: PhoneCountry[] } {
  if (cache) return cache;

  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const toCountry = (code: CountryCode): PhoneCountry => ({
    code,
    name: names.of(code) ?? code,
    dial: getCountryCallingCode(code),
    flag: flagEmoji(code),
  });

  cache = {
    pinned: PINNED.map(toCountry),
    rest: getCountries()
      .filter((code) => !PINNED.includes(code))
      .map(toCountry)
      .sort((a, b) => a.name.localeCompare(b.name, "en")),
  };
  return cache;
}

/** A country the picker offers; anything else posted to the action is refused. */
export function toPhoneCountry(value: string): CountryCode | null {
  return isSupportedCountry(value) ? value : null;
}

/** Regional indicator letters: "GH" becomes 🇬🇭. Windows desktops show the letters. */
function flagEmoji(code: string): string {
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
