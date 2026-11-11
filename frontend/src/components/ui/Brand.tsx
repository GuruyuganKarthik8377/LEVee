import { Fragment } from "react";

/**
 * The LEVee wordmark: a bold, tightly tracked sans "LEV" with an italic serif "ee".
 * It sets its own fonts, so it looks the same inside headlines, body copy and the logo.
 */
export default function Brand() {
  return (
    <span className="inline-flex items-baseline whitespace-nowrap normal-case">
      <span className="font-sans font-bold tracking-[-0.04em]">LEV</span>
      <span className="brand-ee ml-[0.02em] font-serif text-[1.18em] font-normal italic leading-none tracking-[-0.01em]">ee</span>
    </span>
  );
}

const ACCENT = /^\*(.+)\*$/;

/** Headline text without the *accent* markers, for aria-labels. */
export function plainText(text: string) {
  return text.replaceAll("*", "");
}

/**
 * Renders one headline word: "LEVee" becomes the wordmark, and a word wrapped in asterisks
 * ("*before*") becomes the italic serif accent that echoes the wordmark's "ee".
 */
export function withBrand(word: string) {
  const accent = word.match(ACCENT);
  if (accent) return <span className="accent">{accent[1]}</span>;

  const parts = word.split("LEVee");
  return parts.map((part, i) => (
    <Fragment key={i}>
      {part}
      {i < parts.length - 1 && <Brand />}
    </Fragment>
  ));
}
