import { Column, Row, Section, Text } from "@react-email/components";

import { EmailLayout, colors, styles } from "./email-layout";

export type RegistrationConfirmationEmailProps = {
  firstName: string;
  fullName: string;
  /** "Creators Night" */
  nightName: string;
  nightNumber: number;
  /** "Thursday, 8 October 2026", or null when no published event gives the date. */
  date: string | null;
  eventName: string | null;
  venue: string | null;
  /** As the guest typed it, read back: 024 123 4567, +1 212 555 0123. */
  phone: string;
};

/**
 * The guest's confirmation that they are on the list for the night they picked.
 *
 * Says what is true and no more: they registered, for which night, when and where. It
 * does not promise entry or describe the door — that is the organiser's to say, and
 * nobody has said it. React escapes every value, so nothing a guest types becomes markup.
 */
export function RegistrationConfirmationEmail(props: RegistrationConfirmationEmailProps) {
  const rows: [string, string][] = [
    ["Night", `${props.nightName} (Day ${props.nightNumber})`],
    ...(props.date ? ([["Date", props.date]] as [string, string][]) : []),
    ...(props.venue ? ([["Venue", props.venue]] as [string, string][]) : []),
    ["Registered as", props.fullName],
    ["Phone", props.phone],
  ];

  return (
    <EmailLayout
      preview={registrationConfirmationIntro(props)}
      eyebrow={props.eventName ?? "Guest registration"}
      heading={`You're on the list, ${props.firstName}!`}
      footer={
        <>
          You are receiving this because this email address was used to register for{" "}
          {props.nightName}
          {props.eventName ? ` at ${props.eventName}` : ""}. If that wasn&apos;t you, you
          can ignore this email.
        </>
      }
    >
      <Text style={styles.paragraph}>{registrationConfirmationIntro(props)}</Text>

      <Section style={card}>
        {rows.map(([label, value]) => (
          <Row key={label} style={row}>
            <Column style={labelCell}>{label}</Column>
            <Column style={valueCell}>{value}</Column>
          </Row>
        ))}
      </Section>

      <Text style={styles.paragraph}>{registrationConfirmationClosing()}</Text>
      <Text style={{ ...styles.paragraph, margin: 0, fontWeight: 700, color: colors.ink }}>
        See you there!
      </Text>
    </EmailLayout>
  );
}

/** Shared with the plain-text part, so the two versions never say different things. */
export function registrationConfirmationIntro(
  props: Pick<RegistrationConfirmationEmailProps, "nightName" | "nightNumber" | "date" | "eventName">,
): string {
  const thanks = props.eventName
    ? `Thank you for registering for ${props.eventName}.`
    : "Thank you for registering.";
  const on = props.date ? ` on ${props.date}` : "";
  return `${thanks} Your place on the guest list for ${props.nightName} (Day ${props.nightNumber})${on} is confirmed.`;
}

export function registrationConfirmationClosing(): string {
  return "Keep this email handy so you have the night, the date and the venue to hand.";
}

const card = {
  margin: "4px 0 24px",
  padding: "4px 18px",
  backgroundColor: colors.page,
  borderLeft: `4px solid ${colors.blue}`,
} satisfies React.CSSProperties;

const row = { borderBottom: `1px solid ${colors.rule}` } satisfies React.CSSProperties;

const labelCell = {
  width: "96px",
  padding: "10px 12px 10px 0",
  fontSize: "13px",
  color: colors.muted,
  verticalAlign: "top",
} satisfies React.CSSProperties;

const valueCell = {
  padding: "10px 0",
  fontSize: "15px",
  fontWeight: 700,
  color: colors.ink,
  verticalAlign: "top",
  wordBreak: "break-word",
} satisfies React.CSSProperties;
