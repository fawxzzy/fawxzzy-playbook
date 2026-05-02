import { describe, expect, it } from 'vitest';
import { buildChangelogEntries, buildChangelogEntry } from './entryBuilder.js';
import type { ClassifiedChangelogChange } from './types.js';

const createClassifiedChange = (
  overrides: Partial<ClassifiedChangelogChange> = {}
): ClassifiedChangelogChange => ({
  raw: {
    id: '1234567890abcdef',
    shortId: '1234567',
    sourceType: 'commit',
    title: 'feat(api): add changelog command',
    body: undefined,
    author: { name: 'Zach' },
    url: 'https://example.test/commit/1234567'
  },
  category: 'feature',
  confidence: 1,
  reasons: ['matched conventional commit prefix "feat"'],
  breakingChange: false,
  securityRelated: false,
  ...overrides
});

describe('buildChangelogEntry', () => {
  it('cleans conventional prefixes and preserves scope', () => {
    const entry = buildChangelogEntry(createClassifiedChange());

    expect(entry.what).toBe('api: add changelog command');
  });

  it('removes ticket ids when configured', () => {
    const entry = buildChangelogEntry(
      createClassifiedChange({
        raw: {
          ...createClassifiedChange().raw,
          title: 'feat: PB-123 add changelog command'
        }
      }),
      { removeTicketIds: true }
    );

    expect(entry.what).toBe('add changelog command');
  });

  it('extracts explicit WHY lines from the body', () => {
    const entry = buildChangelogEntry(
      createClassifiedChange({
        raw: {
          ...createClassifiedChange().raw,
          body: 'Context line\nWhy: Makes release notes reviewable\nTrailing note'
        }
      })
    );

    expect(entry.why).toBe('Makes release notes reviewable');
  });

  it('uses category fallback WHY text when rationale is missing', () => {
    const entry = buildChangelogEntry(
      createClassifiedChange({
        category: 'refactor',
        raw: {
          ...createClassifiedChange().raw,
          title: 'refactor: reorganize modules'
        }
      })
    );

    expect(entry.why).toBe('Improves maintainability without intended behavior change.');
  });

  it('includes source refs and omits authors by default', () => {
    const entry = buildChangelogEntry(createClassifiedChange());

    expect(entry.sourceRefs).toEqual(['1234567', 'https://example.test/commit/1234567']);
  });

  it('includes authors when configured', () => {
    const entry = buildChangelogEntry(createClassifiedChange(), { includeAuthors: true });

    expect(entry.sourceRefs).toEqual(['1234567', 'https://example.test/commit/1234567', 'Zach']);
  });

  it('preserves breaking and security flags plus confidence and reasons', () => {
    const entry = buildChangelogEntry(
      createClassifiedChange({
        confidence: 0.8,
        reasons: ['matched title keyword "latency"'],
        breakingChange: true,
        securityRelated: true
      })
    );

    expect(entry.breakingChange).toBe(true);
    expect(entry.securityRelated).toBe(true);
    expect(entry.confidence).toBe(0.8);
    expect(entry.reasons).toEqual(['matched title keyword "latency"']);
  });
});

describe('buildChangelogEntries', () => {
  it('deduplicates by stable source ref while preserving order', () => {
    const entries = buildChangelogEntries([
      createClassifiedChange({
        raw: {
          ...createClassifiedChange().raw,
          id: 'aaaa1111',
          shortId: 'aaaa111'
        }
      }),
      createClassifiedChange({
        raw: {
          ...createClassifiedChange().raw,
          id: 'bbbb2222',
          shortId: 'aaaa111'
        }
      }),
      createClassifiedChange({
        raw: {
          ...createClassifiedChange().raw,
          id: 'cccc3333',
          shortId: 'cccc333',
          title: 'fix: repair duplicate marker'
        },
        category: 'fix'
      })
    ]);

    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.sourceRefs[0])).toEqual(['aaaa111', 'cccc333']);
  });

  it('preserves stable ordering for unique items', () => {
    const entries = buildChangelogEntries([
      createClassifiedChange({
        raw: {
          ...createClassifiedChange().raw,
          id: '111',
          shortId: '111',
          title: 'docs: update release guide'
        },
        category: 'docs'
      }),
      createClassifiedChange({
        raw: {
          ...createClassifiedChange().raw,
          id: '222',
          shortId: '222',
          title: 'fix: repair parser'
        },
        category: 'fix'
      })
    ]);

    expect(entries.map((entry) => entry.what)).toEqual(['update release guide', 'repair parser']);
  });
});
