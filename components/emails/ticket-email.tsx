import { Button, Link, Text } from "@react-email/components";

import { EmailLayout, colors, styles } from "./email-layout";

export type TicketEmailProps = {
  eventName: string;
  /** One per admission, in the order the gate list shows them. */
  codes: string[];
  /** One ticket's page, or the order page when there are several. */
  link: string;
};

/**
 * The buyer's ticket.
 *
 * Same content and link rule as the SMS (see composeTicketMessage): one ticket links to
 * that ticket, several link to the order page, where the buyer hands each one on
 * separately — a ticket link admits whoever holds it. The codes are printed because the
 * gate may have no signal. No QR image: many clients block images by default, and the
 * QR is on the page the button opens.
 */
export function TicketEmail({ eventName, codes, link }: TicketEmailProps) {
  const many = codes.length > 1;
  const codeLabel = many ? "Codes" : "Code";

  return (
    <EmailLayout
      preview={`${codeLabel}: ${codes.join(", ")}`}
      eyebrow={eventName}
      heading={many ? `Your ${codes.length} tickets` : "Your ticket"}
      footer={
        <>
          Button not working? Paste this into your browser:
          <br />
          <Link href={link} style={{ ...styles.link, wordBreak: "break-all" }}>
            {link}
          </Link>
        </>
      }
    >
      <Text style={{ ...styles.paragraph, margin: "0 0 24px" }}>
        {ticketIntro(codes.length)}
      </Text>

      <Button href={link} style={button}>
        {ticketAction(codes.length)}
      </Button>

      <Text style={{ margin: "28px 0 6px", fontSize: "13px", color: colors.muted }}>
        {codeLabel}
      </Text>
      <Text style={codeStyle}>
        {codes.map((code, i) => (
          <span key={code}>
            {i > 0 ? <br /> : null}
            {code}
          </span>
        ))}
      </Text>
    </EmailLayout>
  );
}

/** Shared with the plain-text part, so the two versions never say different things. */
export function ticketIntro(count: number): string {
  return count > 1
    ? `You have ${count} tickets. Open the link to see them all, then send each person their own. A ticket link admits whoever holds it, so share each one only with the person it is for.`
    : "Show the QR code on your ticket at the gate. No signal at the venue? The code below works too.";
}

export function ticketAction(count: number): string {
  return count > 1 ? "Open your tickets" : "Open your ticket";
}

const button = {
  backgroundColor: colors.blue,
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: 700,
  textDecoration: "none",
  padding: "14px 26px",
} satisfies React.CSSProperties;

const codeStyle = {
  margin: 0,
  fontFamily: "Menlo, Consolas, monospace",
  fontSize: "17px",
  lineHeight: "1.5",
  fontWeight: 700,
  letterSpacing: "0.04em",
  color: colors.ink,
} satisfies React.CSSProperties;
