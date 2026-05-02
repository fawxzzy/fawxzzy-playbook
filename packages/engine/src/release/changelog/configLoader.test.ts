import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getDefaultChangelogConfig } from './config.js';
import {
  DEFAULT_CHANGELOG_CONFIG_PATH,
  loadChangelogConfig
} from './configLoader.js';

const createTempRepo = (): string => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-changelog-config-'));
  fs.mkdirSync(path.join(repoRoot, '.playbook'), { recursive: true });
  return repoRoot;
};

describe('loadChangelogConfig', () => {
  it('returns defaults when the config file is missing', () => {
    const repoRoot = createTempRepo();

    const result = loadChangelogConfig(repoRoot);

    expect(result.exists).toBe(false);
    expect(result.path).toBe(DEFAULT_CHANGELOG_CONFIG_PATH);
    expect(result.diagnostics).toEqual([]);
    expect(result.config).toEqual(getDefaultChangelogConfig());
  });

  it('merges a valid config file with defaults', () => {
    const repoRoot = createTempRepo();
    fs.writeFileSync(
      path.join(repoRoot, DEFAULT_CHANGELOG_CONFIG_PATH),
      JSON.stringify({
        includeAuthors: true,
        lowConfidenceThreshold: 0.45,
        pathRules: [
          {
            pattern: 'packages/contracts/src/**',
            category: 'feature',
            confidence: 0.4
          }
        ]
      }, null, 2),
      'utf8'
    );

    const result = loadChangelogConfig(repoRoot);

    expect(result.exists).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.config.includeAuthors).toBe(true);
    expect(result.config.lowConfidenceThreshold).toBe(0.45);
    expect(result.config.includeSourceRefs).toBe(true);
    expect(result.config.pathRules).toEqual([
      {
        pattern: 'packages/contracts/src/**',
        category: 'feature',
        confidence: 0.4
      }
    ]);
  });

  it('returns diagnostics for invalid config content', () => {
    const repoRoot = createTempRepo();
    fs.writeFileSync(
      path.join(repoRoot, DEFAULT_CHANGELOG_CONFIG_PATH),
      JSON.stringify({
        lowConfidenceThreshold: 2
      }, null, 2),
      'utf8'
    );

    const result = loadChangelogConfig(repoRoot);

    expect(result.exists).toBe(true);
    expect(
      result.diagnostics.some((diagnostic) =>
        diagnostic.id === 'changelog.config.low-confidence-threshold.out-of-range')
    ).toBe(true);
  });

  it('supports a custom config path', () => {
    const repoRoot = createTempRepo();
    const customConfigPath = path.join(repoRoot, 'tmp', 'changelog.custom.json');
    fs.mkdirSync(path.dirname(customConfigPath), { recursive: true });
    fs.writeFileSync(
      customConfigPath,
      JSON.stringify({
        failOnUnknown: true
      }, null, 2),
      'utf8'
    );

    const result = loadChangelogConfig(repoRoot, {
      configPath: customConfigPath
    });

    expect(result.exists).toBe(true);
    expect(result.path).toBe('tmp/changelog.custom.json');
    expect(result.config.failOnUnknown).toBe(true);
  });

  it('requires the config file when allowMissing is false', () => {
    const repoRoot = createTempRepo();

    const result = loadChangelogConfig(repoRoot, {
      allowMissing: false
    });

    expect(
      result.diagnostics.some((diagnostic) => diagnostic.id === 'changelog.config.file.missing')
    ).toBe(true);
  });

  it('loads the repo-specific changelog config without validation errors', () => {
    const repoRoot = path.resolve(process.cwd(), '..', '..');

    const result = loadChangelogConfig(repoRoot);

    expect(result.exists).toBe(true);
    expect(result.path).toBe(DEFAULT_CHANGELOG_CONFIG_PATH);
    expect(result.diagnostics).toEqual([]);
    expect(
      result.config.pathRules.some((rule) => rule.pattern === 'packages/contracts/src/**' && rule.category === 'feature')
    ).toBe(true);
  });
});
