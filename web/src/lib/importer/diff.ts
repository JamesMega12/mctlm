export interface WordPart {
  t: string;
  /** True for a word that `other` doesn't contain. */
  changed: boolean;
}

/** Splits `text` into words and the spaces between them, flagging each word
 * that `other` lacks. Used to show what differs between two close wordings. */
export function markChanged(text: string, other: string): WordPart[] {
  const have = new Set(other.split(/\s+/));
  return text.split(/(\s+)/).map((t) => ({ t, changed: t.trim() !== '' && !have.has(t) }));
}
