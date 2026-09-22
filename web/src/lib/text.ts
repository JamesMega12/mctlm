/**
 * Jaccard overlap on 3+ letter words. Powers look-alike detection: 0.5 in the
 * add-check form, 0.55 in the drawer's "Look-alike checks" panel.
 */
export function sim(a: string, b: string): number {
  const tokenize = (s: string) => new Set(s.toLowerCase().match(/[a-z]{3,}/g) || []);
  const A = tokenize(a);
  const B = tokenize(b);
  let intersection = 0;
  A.forEach((x) => B.has(x) && intersection++);
  const union = A.size + B.size - intersection;
  return intersection / (union || 1);
}
