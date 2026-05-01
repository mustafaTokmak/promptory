import { describe, it, expect } from 'vitest';
import { detectPii, type PiiMatch } from './pii';

describe('detectPii', () => {
  it('detects email addresses', () => {
    const matches = detectPii('Send a reply to john@example.com please');
    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe('email');
    expect(matches[0].value).toBe('john@example.com');
  });

  it('detects phone numbers', () => {
    const matches = detectPii('Call me at +1 555-123-4567 tomorrow');
    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe('phone');
  });

  it('detects credit card numbers', () => {
    const matches = detectPii('My card is 4111 1111 1111 1111');
    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe('credit_card');
  });

  it('detects SSNs', () => {
    const matches = detectPii('SSN: 123-45-6789');
    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe('ssn');
  });

  it('detects auth tokens in URLs', () => {
    const matches = detectPii('Check https://app.example.com?token=abc123secret');
    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe('auth_token');
  });

  it('returns empty array for clean prompts', () => {
    const matches = detectPii('What is the best CRM for a 10-person startup?');
    expect(matches).toHaveLength(0);
  });

  it('detects multiple PII types in one prompt', () => {
    const matches = detectPii('Email sarah@corp.com or call 555-987-6543');
    expect(matches).toHaveLength(2);
  });
});
