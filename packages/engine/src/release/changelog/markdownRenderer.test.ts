import { describe, expect, it } from 'vitest';
import type { ChangelogEntry } from './types.js';
import { renderMarkdownChangelog } from './markdownRenderer.js';

const sampleEntries: ChangelogEntry[] = [
  {
    category: 'unknown',
    what: 'Capture an uncategorized edge case',
    why: 'Keeps visibility on changes with no current classifier match.',
    sourceRefs: ['zzz999'],
    breakingChange: false,
    securityRelated: false
  },
  {
    category: 'fix',
    what: 'Repair release tag parsing',
    why: 'Corrects incorrect release range detection.',
    sourceRefs: ['abc123', 'https://example.test/pr/12'],
    breakingChange: true,
    securityRelated: false
  },
  {
    category: 'security',
    what: 'Harden token redaction',
    why: 'Reduces accidental secret exposure in generated notes.',
    sourceRefs: ['def456'],
    breakingChange: false,
    securityRelated: true
  },
  {
    category: 'docs',
    what: 'Document release rehearsal steps',
    why: 'Improves project documentation.',
    sourceRefs: [],
    breakingChange: false,
    securityRelated: false
  }
];

describe('renderMarkdownChangelog', () => {
  it('groups entries by configured category order with heading and version details', () => {
    const markdown = renderMarkdownChangelog(sampleEntries, {
      version: 'v1.2.3',
      date: '2026-05-02'
    });

    expect(markdown).toContain('# Changelog');
    expect(markdown).toContain('## v1.2.3 (2026-05-02)');
    expect(markdown.indexOf('### Fixes')).toBeLessThan(markdown.indexOf('### Security'));
    expect(markdown.indexOf('### Security')).toBeLessThan(markdown.indexOf('### Documentation'));
    expect(markdown.indexOf('### Documentation')).toBeLessThan(markdown.indexOf('### Unknown'));
  });

  it('excludes unknown entries when disabled', () => {
    const markdown = renderMarkdownChangelog(sampleEntries, {
      includeUnknown: false
    });

    expect(markdown).not.toContain('## Unknown');
    expect(markdown).not.toContain('Capture an uncategorized edge case');
  });

  it('renders what, why, source refs, and flags deterministically', () => {
    const markdown = renderMarkdownChangelog(sampleEntries);

    expect(markdown).toContain('- **WHAT:** Repair release tag parsing [BREAKING CHANGE]');
    expect(markdown).toContain('  **WHY:** Corrects incorrect release range detection.');
    expect(markdown).toContain('  Source: abc123, https://example.test/pr/12');
    expect(markdown).toContain('- **WHAT:** Harden token redaction [SECURITY-RELATED]');
  });

  it('can suppress source refs through renderer options', () => {
    const markdown = renderMarkdownChangelog(sampleEntries, {
      includeSourceRefs: false
    });

    expect(markdown).not.toContain('Source:');
  });

  it('avoids duplicate blank lines between sections and entries', () => {
    const markdown = renderMarkdownChangelog(sampleEntries);

    expect(markdown).not.toContain('\n\n\n');
    expect(markdown.endsWith('\n')).toBe(true);
  });

  it('produces identical output for repeated renders with the same input', () => {
    const first = renderMarkdownChangelog(sampleEntries, {
      version: 'v1.2.3',
      date: '2026-05-02',
      heading: '# Release Notes'
    });
    const second = renderMarkdownChangelog(sampleEntries, {
      version: 'v1.2.3',
      date: '2026-05-02',
      heading: '# Release Notes'
    });

    expect(first).toBe(second);
  });
});
