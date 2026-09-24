import { Link, Text } from "@react-email/components";

import { EmailLayout, styles } from "./email-layout";

export type BroadcastEmailProps = {
  eventName: string;
  /** The organiser's own subject, if they gave one. */
  heading: string;
  body: string;
};

/**
 * An organiser's broadcast. Their words as they typed them: blank lines become
 * paragraphs, single line breaks stay, and bare links become clickable. React escapes
 * the text, so nothing the organiser types can turn into markup.
 */
export function BroadcastEmail({ eventName, heading, body }: BroadcastEmailProps) {
  const paragraphs = body.trim().split(/\n{2,}/);

  return (
    <EmailLayout
      preview={body.slice(0, 120)}
      eyebrow={eventName}
      heading={heading}
      footer="You are receiving this because you bought a ticket for this event."
    >
      {paragraphs.map((para, i) => (
        <Text key={i} style={styles.paragraph}>
          {para.split("\n").map((line, j) => (
            <span key={j}>
              {j > 0 ? <br /> : null}
              {linkify(line)}
            </span>
          ))}
        </Text>
      ))}
    </EmailLayout>
  );
}

const URL_PATTERN = /(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g;

function linkify(line: string): React.ReactNode[] {
  // split() with a capture group keeps the URLs, at the odd indexes.
  return line.split(URL_PATTERN).map((part, i) =>
    i % 2 === 1 ? (
      <Link key={i} href={part} style={styles.link}>
        {part}
      </Link>
    ) : (
      part
    ),
  );
}
