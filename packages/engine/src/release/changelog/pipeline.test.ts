import { afterEach, describe, expect, it } from 'vitest';
import { planChangelogAppend } from './append.js';
import { classifyChangelogChanges } from './classifier.js';
import { loadChangelogConfig } from './configLoader.js';
import { buildChangelogEntries } from './entryBuilder.js';
import { collectGitChangelogChanges } from './gitCollector.js';
import { renderJsonChangelog } from './jsonRenderer.js';
import { renderMarkdownChangelog } from './markdownRenderer.js';
import {
  cleanupTempDirs,
  commitRepoFile,
  createTempGitRepo,
  makeManagedChangelog,
  makeManagedChangelogWithGeneratedSeam,
  makeRawChangelogFixtures,
  makeSimpleChangelog,
  repoRootFromEnginePackage
} from './testHelpers.js';
import { validateChangelogGeneration } from './validate.js';

const tempDirs: string[] = [];

afterEach(() => {
  cleanupTempDirs(tempDirs);
});

describe('changelog pipeline regression coverage', () => {
  it('classifies, builds, renders, and validates fixture changes with repo config', () => {
    const repoRoot = repoRootFromEnginePackage();
    const loadedConfig = loadChangelogConfig(repoRoot);
    const fixtures = makeRawChangelogFixtures();
    const rawChanges = [
      fixtures.multilineWhyChange,
      fixtures.fixCommit,
      fixtures.securityChange,
      fixtures.performanceChange,
      fixtures.refactorChange,
      fixtures.docsOnlyChange,
      fixtures.infraChange,
      fixtures.unknownChange
    ];

    const classifiedChanges = classifyChangelogChanges(rawChanges, loadedConfig.config);
    const entries = buildChangelogEntries(classifiedChanges, loadedConfig.config);
    const markdown = renderMarkdownChangelog(entries, {
      configOverrides: loadedConfig.config,
      baseRef: 'v1.2.0',
      headRef: 'HEAD',
      version: '1.3.0',
      date: '2026-05-02'
    });
    const json = renderJsonChangelog(entries, {
      configOverrides: loadedConfig.config,
      baseRef: 'v1.2.0',
      headRef: 'HEAD',
      version: '1.3.0',
      generatedAt: '2026-05-02T12:00:00Z'
    });
    const validation = validateChangelogGeneration({
      entries,
      classifiedChanges,
      configOverrides: loadedConfig.config,
      generatedMarkdown: markdown,
      baseRef: 'v1.2.0',
      headRef: 'HEAD'
    });

    expect(loadedConfig.diagnostics).toEqual([]);
    expect(classifiedChanges.map((change) => change.category)).toEqual([
      'feature',
      'fix',
      'security',
      'performance',
      'refactor',
      'docs',
      'infra',
      'unknown'
    ]);
    expect(entries[0]?.why).toBe('keep repo rules centralized.');
    expect(markdown).toContain('## 1.3.0 (2026-05-02)');
    expect(markdown).toContain('### Features');
    expect(markdown).toContain('**WHY:** keep repo rules centralized.');
    expect(markdown).toContain('### Unknown');
    expect(json.sections.map((section) => section.category)).toEqual([
      'feature',
      'fix',
      'security',
      'performance',
      'refactor',
      'docs',
      'infra',
      'unknown'
    ]);
    expect(json.generatedAt).toBe('2026-05-02T12:00:00Z');
    expect(validation.status).toBe('pass');
    expect(validation.summary.unknownCount).toBe(1);
  });

  it('applies repo path rules and preserves stronger title or label signals over weak defaults', () => {
    const repoRoot = repoRootFromEnginePackage();
    const config = loadChangelogConfig(repoRoot).config;
    const fixtures = makeRawChangelogFixtures();

    const docsOnly = classifyChangelogChanges([fixtures.docsOnlyChange], config)[0];
    const labelDriven = classifyChangelogChanges([fixtures.labelDrivenChange], config)[0];
    const weakPathFallback = classifyChangelogChanges([fixtures.weakPathFallbackChange], config)[0];
    const fixOnEnginePath = classifyChangelogChanges([fixtures.fixCommit], config)[0];

    expect(docsOnly?.category).toBe('docs');
    expect(labelDriven?.category).toBe('docs');
    expect(labelDriven?.confidence).toBe(1);
    expect(weakPathFallback?.category).toBe('feature');
    expect(weakPathFallback?.confidence).toBe(0.3);
    expect(fixOnEnginePath?.category).toBe('fix');
    expect(fixOnEnginePath?.confidence).toBe(1);
  });

  it('excludes unknown entries when requested and reports unknown plus low-confidence diagnostics when enforced', () => {
    const repoRoot = repoRootFromEnginePackage();
    const config = loadChangelogConfig(repoRoot).config;
    const fixtures = makeRawChangelogFixtures();
    const classifiedChanges = classifyChangelogChanges(
      [fixtures.unknownChange, fixtures.weakPathFallbackChange],
      config
    );
    const entries = buildChangelogEntries(classifiedChanges, config);

    const markdown = renderMarkdownChangelog(entries, {
      configOverrides: config,
      includeUnknown: false
    });
    const json = renderJsonChangelog(entries, {
      configOverrides: config,
      includeUnknown: false,
      generatedAt: '2026-05-02T12:00:00Z'
    });
    const validation = validateChangelogGeneration({
      entries,
      classifiedChanges,
      configOverrides: {
        ...config,
        failOnUnknown: true,
        lowConfidenceThreshold: 0.31
      },
      generatedMarkdown: markdown,
      baseRef: 'v1.2.0',
      headRef: 'HEAD'
    });

    expect(markdown).not.toContain('## Unknown');
    expect(json.sections.map((section) => section.category)).toEqual(['feature']);
    expect(validation.status).toBe('fail');
    expect(validation.summary.unknownCount).toBe(1);
    expect(validation.summary.lowConfidenceCount).toBe(2);
    expect(
      validation.diagnostics.some((diagnostic) => diagnostic.id === 'changelog.validation.category.unknown')
    ).toBe(true);
    expect(
      validation.diagnostics.some((diagnostic) => diagnostic.id === 'changelog.validation.confidence.low')
    ).toBe(true);
  });

  it('blocks ambiguous managed targets and replaces only the generated seam when present', () => {
    const repoRoot = repoRootFromEnginePackage();
    const config = loadChangelogConfig(repoRoot).config;
    const fixtures = makeRawChangelogFixtures();
    const entries = buildChangelogEntries(
      classifyChangelogChanges([fixtures.featureCommit], config),
      config
    );
    const markdown = renderMarkdownChangelog(entries, {
      configOverrides: config
    });

    const blocked = planChangelogAppend({
      existingContent: makeManagedChangelog(),
      generatedMarkdown: markdown,
      targetFile: 'docs/CHANGELOG.md',
      baseRef: 'v1.2.0',
      headRef: 'HEAD'
    });
    const planned = planChangelogAppend({
      existingContent: makeManagedChangelogWithGeneratedSeam(),
      generatedMarkdown: markdown,
      targetFile: 'docs/CHANGELOG.md',
      baseRef: 'v1.2.0',
      headRef: 'HEAD'
    });

    expect(blocked.status).toBe('blocked');
    expect(blocked.diagnostics[0]?.message).toContain('choose a safe generated section seam');
    expect(planned.status).toBe('planned');
    expect(planned.content).toContain('PLAYBOOK:GENERATED_CHANGELOG_START');
    expect(planned.content).toContain('PLAYBOOK:CHANGELOG_RELEASE_NOTES_START');
    expect(planned.content).toContain('add changelog generator');
    expect(planned.content).not.toContain('\n# Changelog\n');
    expect(planned.content).not.toContain('old generated content');
  });

  it('preserves simple changelog content when planning append output', () => {
    const repoRoot = repoRootFromEnginePackage();
    const config = loadChangelogConfig(repoRoot).config;
    const fixtures = makeRawChangelogFixtures();
    const entries = buildChangelogEntries(
      classifyChangelogChanges([fixtures.fixCommit], config),
      config
    );
    const markdown = renderMarkdownChangelog(entries, {
      configOverrides: config
    });

    const result = planChangelogAppend({
      existingContent: makeSimpleChangelog(),
      generatedMarkdown: markdown
    });

    expect(result.status).toBe('planned');
    expect(result.content).toContain('Historical notes.');
    expect(result.content).toContain('correct markdown ordering');
  });

  it('collects real git commits and renders them end to end', () => {
    const repoRoot = createTempGitRepo();
    tempDirs.push(repoRoot);
    const baseCommit = commitRepoFile(repoRoot, {
      message: 'chore: initial state',
      filePath: 'README.md',
      content: 'initial\n',
      date: '2026-04-01T00:00:00Z'
    });

    commitRepoFile(repoRoot, {
      message: 'feat: add temp repo coverage',
      body: 'Why: prove the collector and renderer work together.',
      filePath: 'packages/engine/src/release/changelog/temp.ts',
      content: 'export const temp = true;\n',
      date: '2026-04-02T00:00:00Z'
    });
    commitRepoFile(repoRoot, {
      message: 'docs: update temp repo release guide',
      filePath: 'docs/RELEASING.md',
      content: '# Release guide\n',
      date: '2026-04-03T00:00:00Z'
    });

    const config = loadChangelogConfig(repoRoot).config;
    const collected = collectGitChangelogChanges(repoRoot, { baseRef: baseCommit });
    const classified = classifyChangelogChanges(collected, config);
    const entries = buildChangelogEntries(classified, config);
    const markdown = renderMarkdownChangelog(entries, {
      configOverrides: config
    });

    expect(collected.map((change) => change.title)).toEqual([
      'feat: add temp repo coverage',
      'docs: update temp repo release guide'
    ]);
    expect(collected[0]?.body).toContain('Why: prove the collector and renderer work together.');
    expect(collected[0]?.files).toEqual([
      { path: 'packages/engine/src/release/changelog/temp.ts', status: 'A' }
    ]);
    expect(markdown).toContain('## Features');
    expect(markdown).toContain('## Documentation');
    expect(markdown).toContain('prove the collector and renderer work together.');
  });
});
