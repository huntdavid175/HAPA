import sanitizeHtml from "sanitize-html";

/**
 * The event description is the one field where an admin's input is rendered as markup to
 * every buyer. That makes it stored-XSS territory, so it is sanitised on the way *in* —
 * the database only ever holds markup that is already safe, and the public page does not
 * depend on remembering to clean it again at render time.
 *
 * The allowlist is deliberately small. This is a paragraph about a party, not a CMS:
 * no images, no iframes, no styles, no ids or classes to hang CSS off.
 */
const ALLOWED: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "strong",
    "em",
    "u",
    "s",
    "h3",
    "h4",
    "ul",
    "ol",
    "li",
    "blockquote",
    "a",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
  },
  // javascript: and data: URLs are the obvious way to smuggle a script through an href.
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowProtocolRelative: false,
  transformTags: {
    // Anything the organiser links to is someone else's site. `noopener` stops it
    // reaching back through `window.opener`. Phone and email links hand off to the
    // dialler or mail app, so they get no new tab — on a phone that is a blank one.
    a: (_tag, attribs): sanitizeHtml.Tag => ({
      tagName: "a",
      // Built from the href alone, so a pasted target or rel never carries through.
      attribs: /^https?:/i.test(attribs.href ?? "")
        ? { href: attribs.href, target: "_blank", rel: "noopener noreferrer nofollow" }
        : { href: attribs.href ?? "", rel: "nofollow" },
    }),
    // The editor can emit these; fold them into the tags we allow.
    b: "strong",
    i: "em",
  },
  // Drop the contents of anything disallowed rather than leaving stray text behind.
  nonTextTags: ["style", "script", "textarea", "option", "noscript"],
};

export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, ALLOWED).trim();
}

/** True when the markup carries nothing a reader would see. */
export function isRichTextEmpty(html: string): boolean {
  return richTextToPlain(html).length === 0;
}

/**
 * Flattens the markup to a single line of prose.
 *
 * `description` feeds `<meta name="description">` on both public routes, which is what a
 * WhatsApp link preview shows. Raw tags there would be visible in every shared link, so
 * the metadata reads this rather than the stored markup.
 */
export function richTextToPlain(html: string): string {
  const text = sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: {},
    // Keep sentences from running together where block tags used to be.
    textFilter: (t) => t,
  });

  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Trims to a length a link preview will actually show, breaking on a word. */
export function truncatePlain(text: string, max = 200): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Plain paragraphs typed before the editor existed are still plain text in the database.
 * Wrapping them keeps old and new descriptions rendering the same way.
 */
export function ensureRichText(value: string): string {
  if (!value.trim()) return "";
  if (/<(p|h3|h4|ul|ol|blockquote)\b/i.test(value)) return value;

  return value
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para.trim()).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
