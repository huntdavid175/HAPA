import { Button, Column, Link, Row, Section, Text } from "@react-email/components";

import { EmailLayout, colors, styles } from "./email-layout";

export type RegistrationEmailProps = {
  /** "Night 2 · Creators Night" */
  night: string;
  name: string;
  email: string;
  /** As the organiser would read it back: 024 123 4567, or the foreign number as typed. */
  phone: string;
  occupation: string;
  /** "Other: a colleague", when they wrote one. */
  heardAbout: string;
  /** Who invited them, or null when they left it blank. */
  invitedBy: string | null;
  adminLink: string;
};

/**
 * Tells the organiser someone has just registered at the door. Every field the guest
 * filled in is here, so the email is a record on its own; the button opens the list.
 * React escapes the values, so nothing a guest types can turn into markup.
 */
export function RegistrationEmail(props: RegistrationEmailProps) {
  const rows: [string, React.ReactNode][] = [
    [
      "Email",
      <Link key="email" href={`mailto:${props.email}`} style={styles.link}>
        {props.email}
      </Link>,
    ],
    ["Phone", props.phone],
    ["Occupation", props.occupation],
    ["Heard about it", props.heardAbout],
    ...(props.invitedBy ? ([["Invited by", props.invitedBy]] as [string, React.ReactNode][]) : []),
  ];

  return (
    <EmailLayout
      preview={`${props.name} registered for ${props.night}.`}
      eyebrow={`New registration · ${props.night}`}
      heading={props.name}
      footer="You are receiving this because this address is set to hear about every door registration."
    >
      <Section style={{ margin: "0 0 24px" }}>
        {rows.map(([label, value]) => (
          <Row key={label} style={fieldStyles.row}>
            <Column style={fieldStyles.label}>{label}</Column>
            <Column style={fieldStyles.value}>{value}</Column>
          </Row>
        ))}
      </Section>
      <Button href={props.adminLink} style={fieldStyles.button}>
        See all registrations
      </Button>
      <Text style={{ ...styles.paragraph, margin: "16px 0 0", fontSize: "13px" }}>
        Or open {props.adminLink}
      </Text>
    </EmailLayout>
  );
}

const fieldStyles = {
  row: { borderBottom: `1px solid ${colors.rule}` },
  label: {
    width: "120px",
    padding: "10px 12px 10px 0",
    fontSize: "13px",
    color: colors.muted,
    verticalAlign: "top",
  },
  // A long email address would otherwise squeeze the label column on a phone.
  value: {
    padding: "10px 0",
    fontSize: "15px",
    color: colors.ink,
    verticalAlign: "top",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  },
  button: {
    display: "inline-block",
    padding: "12px 20px",
    backgroundColor: colors.blue,
    color: "#ffffff",
    fontSize: "15px",
    fontWeight: 700,
    textDecoration: "none",
  },
} satisfies Record<string, React.CSSProperties>;
