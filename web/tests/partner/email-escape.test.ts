// K3 — The partner invitation email interpolates the inviter's full_name
// (user-controlled) into HTML. It MUST be HTML-escaped to prevent injection
// (e.g. <img onerror>, <script>) and phishing.

import { describe, expect, it } from 'vitest';
import { escapeHtml } from '@/lib/partner/email';

describe('escapeHtml (K3)', () => {
  it('escapes all 5 HTML-significant characters', () => {
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('>')).toBe('&gt;');
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('"')).toBe('&quot;');
    expect(escapeHtml("'")).toBe('&#39;');
  });

  it('escapes & first so produced entities are not double-escaped', () => {
    // A literal "<" must become "&lt;", not "&amp;lt;".
    expect(escapeHtml('a < b')).toBe('a &lt; b');
    expect(escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
  });

  it('neutralises a <script> injection payload', () => {
    const payload = '<script>alert(document.cookie)</script>';
    const escaped = escapeHtml(payload);
    expect(escaped).not.toContain('<script>');
    expect(escaped).not.toContain('</script>');
    expect(escaped).toContain('&lt;script&gt;');
  });

  it('neutralises an <img onerror> attribute-breakout payload', () => {
    const payload = '"><img src=x onerror=alert(1)>';
    const escaped = escapeHtml(payload);
    // No raw angle brackets or quotes survive to break out of the template.
    expect(escaped).not.toMatch(/[<>]/);
    expect(escaped).not.toContain('"');
  });

  it('leaves a benign name untouched', () => {
    expect(escapeHtml('Pablo Ruiz')).toBe('Pablo Ruiz');
  });
});
