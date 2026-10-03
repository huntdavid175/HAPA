import { Button, Column, Link, Row, Section, Text } from "@react-email/components";

import { EmailLayout, colors, styles } from "./email-layout";

export type TicketRequestEmailProps = {
  eventName: string;
  tierName: string;
  quantity: number;
  /** "US$10,000.00 each", as the card shows it. */
  priceEach: string;
  name: string;
  organisation: string | null;
  email: string;
  phone: string;
  message: string | null;
  heardAbout: string;
  adminLink: string;
};

/**
 * Tells the organiser someone wants a tier that is booked through them rather than paid
 * online. Sent with the requester's address as Reply-To, so answering them is one tap.
 * React escapes every value, so nothing a requester types becomes markup.
 */
export function TicketRequestEmail(props: TicketRequestEmailProps) {
  const rows: [string, React.ReactNode][] = [
    ["Wants", `${props.quantity} × ${props.tierName}`],
    ["Price", props.priceEach],
    ["Name", props.name],
    ...(props.organisation ? ([["Organisation", props.organisation]] as [string, React.ReactNode][]) : []),
    [
      "Email",
      <Link key="email" href={`mailto:${props.email}`} style={styles.link}>
        {props.email}
      </Link>,
    ],
    [
      "Phone",
      <Link key="phone" href={`tel:${props.phone.replace(/\s/g, "")}`} style={styles.link}>
        {props.phone}
      </Link>,
    ],
    ["Heard about it", props.heardAbout],
  ];

  return (
    <EmailLayout
      preview={`${props.organisation ?? props.name} would like ${props.quantity} × ${props.tierName}.`}
      eyebrow={`Ticket request · ${props.eventName}`}
      heading={props.organisation ?? props.name}
      footer="Reply to this email to answer the requester directly. Mark it handled on the Ticket requests page once it is arranged."
    >
      <Text style={styles.paragraph}>
        {props.organisation ? `${props.name} from ${props.organisation}` : props.name} would like
        to book {props.quantity} × {props.tierName}. No payment has been taken.
      </Text>

      <Section style={{ margin: "0 0 24px" }}>
        {rows.map(([label, value]) => (
          <Row key={label} style={field.row}>
            <Column style={field.label}>{label}</Column>
            <Column style={field.value}>{value}</Column>
          </Row>
        ))}
      </Section>

      {props.message ? (
        <Section style={field.message}>
          <Text style={{ ...styles.paragraph, margin: 0, whiteSpace: "pre-wrap" }}>
            {props.message}
          </Text>
        </Section>
      ) : null}

      <Button href={props.adminLink} style={field.button}>
        Open ticket requests
      </Button>
    </EmailLayout>
  );
}

const field = {
  row: { borderBottom: `1px solid ${colors.rule}` },
  label: {
    width: "120px",
    padding: "10px 12px 10px 0",
    fontSize: "13px",
    color: colors.muted,
    verticalAlign: "top",
  },
  value: {
    padding: "10px 0",
    fontSize: "15px",
    color: colors.ink,
    verticalAlign: "top",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
  },
  message: {
    margin: "0 0 24px",
    padding: "14px 18px",
    backgroundColor: colors.page,
    borderLeft: `4px solid ${colors.blue}`,
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
