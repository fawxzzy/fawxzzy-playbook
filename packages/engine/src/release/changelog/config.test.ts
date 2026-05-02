import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHANGELOG_GENERATOR_CONFIG,
  getDefaultChangelogConfig,
  mergeChangelogConfig,
  normalizeChangelogCategory,
  validateChangelogConfig
} from './config.js';

describe('changelog config', () => {
  it('returns deterministic default config values', () => {
    expect(getDefaultChangelogConfig()).toEqual(DEFAULT_CHANGELOG_GENERATOR_CONFIG);
  });

  it('returns a fresh default config copy', () => {
    const first = getDefaultChangelogConfig();
    const second = getDefaultChangelogConfig();

    first.categoryOrder[0] = 'docs';
    first.conventionalCommitCategories.feat = 'docs';
    first.keywordRules[0]!.match = 'rewritten';
    first.pathRules[0]!.pattern = 'rewritten/**';
    first.breakingChangeMarkers[0] = 'rewritten';
    first.securityMarkers[0] = 'rewritten';

    expect(second.categoryOrder[0]).toBe('feature');
    expect(second.conventionalCommitCategories.feat).toBe('feature');
    expect(second.keywordRules[0]!.match).toBe('security');
    expect(second.pathRules[0]!.pattern).toBe('docs/**');
    expect(second.breakingChangeMarkers[0]).toBe('BREAKING CHANGE:');
    expect(second.securityMarkers[0]).toBe('security');
  });

  it('normalizes known and unknown categories', () => {
    expect(normalizeChangelogCategory('FIX')).toBe('fix');
    expect(normalizeChangelogCategory('unknown')).toBe('unknown');
    expect(normalizeChangelogCategory('not-a-category')).toBe('unknown');
  });

  it('merges overrides without dropping defaults', () => {
    const config = mergeChangelogConfig({
      conventionalCommitCategories: {
        hotfix: 'fix'
      },
      includeAuthors: true,
      lowConfidenceThreshold: 0.5
    });

    expect(config.conventionalCommitCategories.feat).toBe('feature');
    expect(config.conventionalCommitCategories.hotfix).toBe('fix');
    expect(config.includeAuthors).toBe(true);
    expect(config.lowConfidenceThreshold).toBe(0.5);
    expect(config.defaultTargetFile).toBe('docs/CHANGELOG.md');
  });

  it('validates the default config without errors', () => {
    expect(validateChangelogConfig(getDefaultChangelogConfig())).toEqual([]);
  });

  it('detects invalid category entries', () => {
    const config = getDefaultChangelogConfig() as typeof DEFAULT_CHANGELOG_GENERATOR_CONFIG & {
      categoryOrder: string[];
    };
    config.categoryOrder = ['feature', 'bogus'];

    const diagnostics = validateChangelogConfig(config as typeof DEFAULT_CHANGELOG_GENERATOR_CONFIG);
    expect(diagnostics.some((diagnostic) => diagnostic.id === 'changelog.config.category-order.invalid-category')).toBe(
      true
    );
  });

  it('detects duplicate category entries', () => {
    const config = mergeChangelogConfig({
      categoryOrder: ['feature', 'fix', 'feature']
    });

    const diagnostics = validateChangelogConfig(config);
    expect(
      diagnostics.some((diagnostic) => diagnostic.id === 'changelog.config.category-order.duplicate-category')
    ).toBe(true);
  });

  it('detects out-of-range thresholds', () => {
    const config = mergeChangelogConfig({
      lowConfidenceThreshold: 1.5
    });

    const diagnostics = validateChangelogConfig(config);
    expect(
      diagnostics.some((diagnostic) => diagnostic.id === 'changelog.config.low-confidence-threshold.out-of-range')
    ).toBe(true);
  });

  it('keeps docs/CHANGELOG.md as the default target', () => {
    expect(getDefaultChangelogConfig().defaultTargetFile).toBe('docs/CHANGELOG.md');
  });
});
