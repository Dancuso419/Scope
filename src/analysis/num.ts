// Numeric fields from the Onchain OS API arrive as strings and are sometimes
// empty or malformed. Parse to a finite number or null — never NaN, and never
// mistake "" (unknown) for 0 (a real value).
export function parseNum(s: unknown): number | null {
  if (typeof s !== 'string' || s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Presentation rounding. Used at the response boundary AND before facts reach
// the narration layer, so plain-English output never carries float noise
// (and the narrator has nothing but clean numbers to echo).
export const round1 = (n: number) => Math.round(n * 10) / 10;
export const round2 = (n: number) => Math.round(n * 100) / 100;
