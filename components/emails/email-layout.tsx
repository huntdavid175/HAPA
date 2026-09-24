import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

/**
 * The frame every HAPA email shares.
 *
 * Light and plain on purpose. The event page is pinned dark, but email clients rewrite
 * colours unpredictably, and a light email survives Gmail's dark mode and Outlook alike.
 * The blue bar is the pricing cards' blue; nothing else carries the brand, because a
 * ticket email's whole job is the button and the code.
 */
export function EmailLayout({
  preview,
  eyebrow,
  heading,
  footer,
  children,
}: {
  /** The grey line inboxes show after the subject. */
  preview: string;
  eyebrow: string;
  heading: string;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Html lang="en">
      <Head>
        <meta name="color-scheme" content="light" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.card}>
          <Section style={styles.bar} />
          <Section style={styles.content}>
            <Text style={styles.eyebrow}>{eyebrow}</Text>
            <Heading as="h1" style={styles.heading}>
              {heading}
            </Heading>
            {children}
          </Section>
          <Section style={styles.footer}>{footer}</Section>
        </Container>
      </Body>
    </Html>
  );
}

export const colors = {
  ink: "#16111b",
  body: "#3b3647",
  muted: "#6f6880",
  blue: "#4056a1",
  rule: "#e4e0ea",
  page: "#efeef3",
};

export const styles = {
  body: {
    margin: 0,
    padding: "32px 16px",
    backgroundColor: colors.page,
    fontFamily: "Helvetica, Arial, sans-serif",
    color: colors.ink,
  },
  card: { maxWidth: "480px", backgroundColor: "#ffffff" },
  bar: { height: "6px", backgroundColor: colors.blue },
  content: { padding: "32px 28px 36px" },
  eyebrow: { margin: "0 0 6px", fontSize: "13px", color: colors.muted },
  heading: {
    margin: "0 0 20px",
    fontSize: "24px",
    lineHeight: "1.2",
    fontWeight: 800,
    color: colors.ink,
  },
  paragraph: { margin: "0 0 16px", fontSize: "15px", lineHeight: "1.55", color: colors.body },
  footer: {
    padding: "20px 28px",
    borderTop: `1px solid ${colors.rule}`,
    fontSize: "12px",
    lineHeight: "1.5",
    color: colors.muted,
  },
  link: { color: colors.blue },
} satisfies Record<string, React.CSSProperties>;
