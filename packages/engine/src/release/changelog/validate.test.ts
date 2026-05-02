import { describe, expect, it } from 'vitest';
import type { ChangelogEntry, ClassifiedChangelogChange } from './types.js';
import { validateChangelogGeneration } from './validate.js';

const makeEntry = (overrides: Partial<ChangelogEntry> = {}): ChangelogEntry => ({
  category: 'feature',
  what: 'Add deterministic changelog generation',
  why: 'Adds local release-note generation.',
  sourceRefs: ['abc1234'],
  breakingChange: false,
  securityRelated: false,
  confidence: 0.8,
  reasons: ['matched conventional commit prefix "feat"'],
  ...overrides
});

const makeClassifiedChange = (
  overrides: Partial<ClassifiedChangelogChange> = {}
): ClassifiedChangelogChange => ({
  raw: {
    id: 'abcdef123456',
    shortId: 'abcdef1',
    sourceType: 'commit',
    title: 'feat: add deterministic changelog generation'
  },
  category: 'feature',
  confidence: 0.8,
  reasons: ['matched conventional commit prefix "feat"'],
  breakingChange: false,
  securityRelated: false,
  ...overrides
});

describe('validateChangelogGeneration', () => {
  it('passes with normal entries', () => {
    const result = validateChangelogGeneration({
      entries: [makeEntry()],
      generatedMarkdown: '## Features\n\n- **WHAT:** Add deterministic changelog generation'
    });

    expect(result.status).toBe('pass');
    expect(result.summary).toEqual({
      entryCount: 1,
      unknownCount: 0,
      lowConfidenceCount: 0,
      breakingChangeCount: 0,
      securityRelatedCount: 0
    });
  });

  it('fails on empty output when changes are required', () => {
    const result = validateChangelogGeneration({
      entries: [],
      generatedMarkdown: '   ',
      configOverrides: { requireChanges: true }
    });

    expect(result.status).toBe('fail');
    expect(result.diagnostics.some((diagnostic) => diagnostic.id === 'changelog.validation.output.empty')).toBe(true);
    expect(result.diagnostics.some((diagnostic) => diagnostic.id === 'changelog.validation.entries.missing')).toBe(true);
  });

  it('fails when unknown entries are disallowed', () => {
    const result = validateChangelogGeneration({
      entries: [makeEntry({ category: 'unknown', confidence: 0.1 })],
      configOverrides: { failOnUnknown: true }
    });

    expect(result.status).toBe('fail');
    expect(result.summary.unknownCount).toBe(1);
    expect(
      result.diagnostics.some(
        (diagnostic) => diagnostic.id === 'changelog.validation.category.unknown' && diagnostic.severity === 'error'
      )
    ).toBe(true);
  });

  it('reports low-confidence diagnostics from entries and classified changes', () => {
    const result = validateChangelogGeneration({
      entries: [makeEntry({ confidence: 0.2 })],
      classifiedChanges: [makeClassifiedChange({ confidence: 0.2 })]
    });

    expect(result.status).toBe('pass');
    expect(result.summary.lowConfidenceCount).toBe(1);
    expect(
      result.diagnostics.filter((diagnostic) => diagnostic.id === 'changelog.validation.confidence.low').length
    ).toBe(2);
  });

  it('reports breaking and security diagnostics', () => {
    const result = validateChangelogGeneration({
      entries: [makeEntry({ breakingChange: true, securityRelated: true, category: 'security' })],
      classifiedChanges: [makeClassifiedChange({ breakingChange: true, securityRelated: true, category: 'security' })]
    });

    expect(result.summary.breakingChangeCount).toBe(1);
    expect(result.summary.securityRelatedCount).toBe(1);
    expect(
      result.diagnostics.some((diagnostic) => diagnostic.id === 'changelog.validation.breaking-change.detected')
    ).toBe(true);
    expect(
      result.diagnostics.some((diagnostic) => diagnostic.id === 'changelog.validation.security-related.detected')
    ).toBe(true);
  });

  it('surfaces invalid config diagnostics', () => {
    const result = validateChangelogGeneration({
      entries: [makeEntry()],
      configOverrides: {
        lowConfidenceThreshold: 1.5,
        markdownHeading: ''
      }
    });

    expect(result.status).toBe('fail');
    expect(
      result.diagnostics.some(
        (diagnostic) => diagnostic.id === 'changelog.config.low-confidence-threshold.out-of-range'
      )
    ).toBe(true);
    expect(
      result.diagnostics.some((diagnostic) => diagnostic.id === 'changelog.config.markdown-heading.missing')
    ).toBe(true);
  });
});
