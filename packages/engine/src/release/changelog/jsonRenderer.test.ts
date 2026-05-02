import { describe, expect, it } from 'vitest';
import type { ChangelogEntry } from './types.js';
import { renderJsonChangelog } from './jsonRenderer.js';

const sampleEntries: ChangelogEntry[] = [
  {
    category: 'feature',
    what: 'Add release candidate preview',
    why: 'Adds new capability for users or maintainers.',
    sourceRefs: ['abc123'],
    breakingChange: false,
    securityRelated: false,
    confidence: 1,
    reasons: ['matched conventional commit prefix "feat"']
  },
  {
    category: 'unknown',
    what: 'Tidy an ambiguous change',
    why: 'Change intent was not clearly classified.',
    sourceRefs: ['zzz999'],
    breakingChange: false,
    securityRelated: false,
    confidence: 0.1,
    reasons: ['no configured rule matched']
  },
  {
    category: 'security',
    what: 'Redact leaked tokens from output',
    why: 'Reduces security risk.',
    sourceRefs: ['def456'],
    breakingChange: false,
    securityRelated: true,
    confidence: 0.8,
    reasons: ['matched keyword "security"']
  }
];

describe('renderJsonChangelog', () => {
  it('returns the expected changelog document shape with injected metadata', () => {
    const rendered = renderJsonChangelog(sampleEntries, {
      generatedAt: '2026-05-02T10:00:00.000Z',
      baseRef: 'v1.2.2',
      headRef: 'HEAD',
      version: 'v1.2.3'
    });

    expect(rendered).toEqual({
      schemaVersion: '1.0',
      kind: 'playbook-changelog',
      generatedAt: '2026-05-02T10:00:00.000Z',
      baseRef: 'v1.2.2',
      headRef: 'HEAD',
      version: 'v1.2.3',
      sections: [
        {
          category: 'feature',
          entries: [
            {
              category: 'feature',
              what: 'Add release candidate preview',
              why: 'Adds new capability for users or maintainers.',
              sourceRefs: ['abc123'],
              breakingChange: false,
              securityRelated: false,
              confidence: 1,
              reasons: ['matched conventional commit prefix "feat"']
            }
          ]
        },
        {
          category: 'security',
          entries: [
            {
              category: 'security',
              what: 'Redact leaked tokens from output',
              why: 'Reduces security risk.',
              sourceRefs: ['def456'],
              breakingChange: false,
              securityRelated: true,
              confidence: 0.8,
              reasons: ['matched keyword "security"']
            }
          ]
        },
        {
          category: 'unknown',
          entries: [
            {
              category: 'unknown',
              what: 'Tidy an ambiguous change',
              why: 'Change intent was not clearly classified.',
              sourceRefs: ['zzz999'],
              breakingChange: false,
              securityRelated: false,
              confidence: 0.1,
              reasons: ['no configured rule matched']
            }
          ]
        }
      ]
    });
  });

  it('excludes unknown entries when requested', () => {
    const rendered = renderJsonChangelog(sampleEntries, {
      includeUnknown: false
    });

    expect(rendered.sections.some((section) => section.category === 'unknown')).toBe(false);
  });

  it('does not inject ambient generatedAt values', () => {
    const rendered = renderJsonChangelog(sampleEntries);

    expect(rendered.generatedAt).toBeUndefined();
  });

  it('preserves stable section and entry ordering across repeated renders', () => {
    const first = renderJsonChangelog(sampleEntries, {
      generatedAt: '2026-05-02T10:00:00.000Z'
    });
    const second = renderJsonChangelog(sampleEntries, {
      generatedAt: '2026-05-02T10:00:00.000Z'
    });

    expect(first).toEqual(second);
  });
});
