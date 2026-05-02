import { describe, expect, it } from 'vitest';
import { classifyChangelogChange, classifyChangelogChanges } from './classifier.js';
import type { RawChangelogChange } from './types.js';

const createRawChange = (overrides: Partial<RawChangelogChange> = {}): RawChangelogChange => ({
  id: '1234567890abcdef',
  shortId: '1234567',
  sourceType: 'commit',
  title: 'update internals',
  ...overrides
});

describe('classifyChangelogChange', () => {
  it.each([
    ['feat: add generator', 'feature'],
    ['feature: add generator', 'feature'],
    ['fix: repair parser', 'fix'],
    ['refactor: simplify module', 'refactor'],
    ['docs: update guide', 'docs'],
    ['doc: update guide', 'docs'],
    ['test: cover parser', 'test'],
    ['tests: cover parser', 'test'],
    ['chore: clean temp state', 'chore'],
    ['perf: speed up render', 'performance'],
    ['performance: speed up render', 'performance'],
    ['security: patch auth flow', 'security'],
    ['sec: patch auth flow', 'security'],
    ['build: update release task', 'infra'],
    ['ci: update workflow', 'infra'],
    ['deps: bump package', 'infra'],
    ['dependency: bump package', 'infra']
  ] satisfies Array<[string, string]>)('maps conventional prefix %s', (title, category) => {
    const classified = classifyChangelogChange(createRawChange({ title }));

    expect(classified.category).toBe(category);
    expect(classified.confidence).toBe(1);
    expect(classified.reasons).toContain(
      `matched conventional commit prefix "${title.split(':', 1)[0].replace(/\(.+\)/u, '').replace('!', '').toLowerCase()}"`
    );
  });

  it('detects breaking change from conventional prefix marker', () => {
    const classified = classifyChangelogChange(createRawChange({ title: 'feat!: overhaul config format' }));

    expect(classified.breakingChange).toBe(true);
    expect(classified.reasons).toContain('detected breaking change marker "feat!"');
  });

  it('detects breaking change from body marker', () => {
    const classified = classifyChangelogChange(
      createRawChange({
        title: 'refactor: restructure planner',
        body: 'BREAKING CHANGE: planning state file changed'
      })
    );

    expect(classified.breakingChange).toBe(true);
    expect(classified.reasons).toContain('detected breaking change marker "BREAKING CHANGE:"');
  });

  it('detects security marker and security-related flag from body', () => {
    const classified = classifyChangelogChange(
      createRawChange({
        title: 'harden auth parser',
        body: 'Fixes auth bypass in credential parsing'
      })
    );

    expect(classified.securityRelated).toBe(true);
    expect(classified.reasons).toContain('detected security marker "auth bypass"');
  });

  it('uses explicit labels as highest-confidence matches', () => {
    const classified = classifyChangelogChange(
      createRawChange({
        title: 'update release docs',
        labels: ['security']
      })
    );

    expect(classified.category).toBe('security');
    expect(classified.confidence).toBe(1);
    expect(classified.reasons).toContain('matched label "security"');
  });

  it('uses strong title keywords when no stronger signal exists', () => {
    const classified = classifyChangelogChange(createRawChange({ title: 'reduce latency in formatter' }));

    expect(classified.category).toBe('performance');
    expect(classified.confidence).toBe(0.8);
    expect(classified.reasons).toContain('matched title keyword "latency"');
  });

  it('uses weak body keyword confidence for body-only matches', () => {
    const classified = classifyChangelogChange(
      createRawChange({
        title: 'touch parser',
        body: 'This addresses a regression in fallback handling'
      })
    );

    expect(classified.category).toBe('fix');
    expect(classified.confidence).toBe(0.3);
    expect(classified.reasons).toContain('matched body keyword "regression"');
  });

  it('honors weak path rules without overriding stronger prefix matches', () => {
    const classified = classifyChangelogChange(
      createRawChange({
        title: 'fix: repair release note merge',
        files: [{ path: 'packages/engine/src/release/index.ts' }]
      })
    );

    expect(classified.category).toBe('fix');
    expect(classified.confidence).toBe(1);
    expect(classified.reasons).toContain('matched conventional commit prefix "fix"');
  });

  it('uses path rule confidence when it is the best available signal', () => {
    const classified = classifyChangelogChange(
      createRawChange({
        files: [{ path: 'packages/engine/src/release/index.ts' }]
      })
    );

    expect(classified.category).toBe('feature');
    expect(classified.confidence).toBe(0.3);
    expect(classified.reasons).toContain('matched file path pattern "packages/engine/src/**"');
  });

  it('falls back to unknown when nothing matches', () => {
    const classified = classifyChangelogChange(
      createRawChange({
        title: 'touch state',
        body: 'No category clues here',
        files: [{ path: 'misc/notes.txt' }]
      })
    );

    expect(classified.category).toBe('unknown');
    expect(classified.confidence).toBe(0.1);
    expect(classified.reasons).toEqual(['no classification rule matched']);
  });

  it('classifies arrays while preserving order', () => {
    const classified = classifyChangelogChanges([
      createRawChange({ id: '1', title: 'docs: update docs' }),
      createRawChange({ id: '2', title: 'fix: repair parser' })
    ]);

    expect(classified.map((entry) => entry.category)).toEqual(['docs', 'fix']);
    expect(classified.map((entry) => entry.raw.id)).toEqual(['1', '2']);
  });
});
