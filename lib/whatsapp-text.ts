/**
 * Turns text copied out of WhatsApp into the editor's HTML.
 *
 * Organisers write their event copy in WhatsApp first and paste it in. Their formatting
 * is WhatsApp's — `*bold*`, `_italic_`, `~strike~` — which Tiptap's own paste rules read
 * as Markdown, making `*bold*` italic. Phone numbers, emails and web addresses become
 * links, so a buyer on a phone can tap to call.
 *
 * The output is only a starting point for the editor; the save action sanitises whatever
 * the editor finally posts (lib/rich-text.ts).
 */
export function whatsappToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n\s*\n/)
    .map((para) => `<p>${para.split("\n").map(line).join("<br>")}</p>`)
    .join("");
}

/** True when a plain-text paste has something this conversion would change. */
export function looksLikeWhatsapp(text: string): boolean {
  return /\n|[*_~]\S|https?:\/\/|www\.|@|\+\d/.test(text);
}

// URL, then email, then phone: the order stops an address inside a URL being read twice.
const LINK =
  /(https?:\/\/[^\s<]*[^\s<.,:;!?)'"]|www\.[^\s<]*[^\s<.,:;!?)'"])|([\w.%+-]+@[\w-]+(?:\.[\w-]+)*\.[a-z]{2,})|(\+\d[\d ()-]{6,}\d)/gi;

function line(raw: string): string {
  // Links are cut out first, so an underscore in a URL is never read as italics.
  const links: string[] = [];
  const marked = raw.replace(LINK, (match, url?: string, email?: string) => {
    const href = url
      ? url.startsWith("www.")
        ? `https://${url}`
        : url
      : email
        ? `mailto:${email}`
        : `tel:+${match.replace(/\D/g, "")}`;
    links.push(`<a href="${escape(href)}">${escape(match)}</a>`);
    return `\u0000${links.length - 1}\u0000`;
  });

  return format(escape(marked)).replace(/\u0000(\d+)\u0000/g, (_, i) => links[Number(i)]);
}

/**
 * WhatsApp's rule: the markers hug the text (no space just inside them) and sit at a word
 * boundary outside. So `2*3*4` and `snake_case_name` stay as typed.
 */
function format(text: string): string {
  const wrap = (marker: string, tag: string) => (s: string) =>
    s.replace(
      new RegExp(
        `(^|[\\s(>\\u0000])\\${marker}(\\S(?:[^${marker}\\n]*?\\S)?)\\${marker}(?=$|[\\s).,:;!?<\\u0000])`,
        "g",
      ),
      `$1<${tag}>$2</${tag}>`,
    );

  return [wrap("*", "strong"), wrap("_", "em"), wrap("~", "s")].reduce(
    (s, apply) => apply(s),
    text,
  );
}

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
