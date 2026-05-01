export type PiiType = 'email' | 'phone' | 'credit_card' | 'ssn' | 'auth_token';

export interface PiiMatch {
  type: PiiType;
  value: string;
  index: number;
}

const PATTERNS: { type: PiiType; regex: RegExp }[] = [
  {
    type: 'email',
    regex: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    // Credit card before phone so spans are registered first
    type: 'credit_card',
    regex: /\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b/g,
  },
  {
    type: 'ssn',
    regex: /\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g,
  },
  {
    type: 'phone',
    regex: /(\+?\d[\d\s\-().]{7,}\d)/g,
  },
  {
    type: 'auth_token',
    regex: /https?:\/\/\S+[?&](token|key|auth|secret|api_key)=[^\s&"']+/gi,
  },
];

/**
 * Scans text for PII patterns. Returns all matches found.
 * Runs more-specific patterns first; phone matches that overlap an already-found
 * span (e.g. a credit card or SSN) are skipped to avoid double-reporting.
 * Empty array means the text is clean.
 */
export function detectPii(text: string): PiiMatch[] {
  const matches: PiiMatch[] = [];

  for (const { type, regex } of PATTERNS) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      // Skip if this span overlaps any already-recorded match
      const overlaps = matches.some(
        (m) => start < m.index + m.value.length && end > m.index,
      );
      if (overlaps) continue;

      matches.push({ type, value: match[0], index: start });
    }
  }

  return matches;
}
