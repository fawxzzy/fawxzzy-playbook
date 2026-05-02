import { describe, expect, it } from 'vitest';
import { planChangelogAppend } from './append.js';

describe('planChangelogAppend', () => {
  it('creates missing changelog content', () => {
    const result = planChangelogAppend({
      existingContent: null,
      generatedMarkdown: '## Features\n\n- **WHAT:** Add changelog generation\n  **WHY:** Adds local release notes.',
      baseRef: 'v1.0.0',
      headRef: 'HEAD'
    });

    expect(result.status).toBe('planned');
    expect(result.targetFile).toBe('docs/CHANGELOG.md');
    expect(result.content).toContain('# Changelog');
    expect(result.content).toContain('<!-- PLAYBOOK:CHANGELOG_GENERATED base=v1.0.0 head=HEAD -->');
  });

  it('inserts generated content under the top-level heading for a simple changelog', () => {
    const result = planChangelogAppend({
      existingContent: '# Changelog\n\nExisting notes.\n',
      generatedMarkdown: '## Features\n\n- **WHAT:** Add changelog generation\n  **WHY:** Adds local release notes.',
      version: '1.2.3'
    });

    expect(result.status).toBe('planned');
    expect(result.content.startsWith('# Changelog\n\n<!-- PLAYBOOK:CHANGELOG_GENERATED version=1.2.3 -->')).toBe(true);
    expect(result.content).toContain('Existing notes.');
  });

  it('preserves existing content when appending to a non-heading changelog', () => {
    const result = planChangelogAppend({
      existingContent: 'Historical notes.\n',
      generatedMarkdown: '## Fixes\n\n- **WHAT:** Correct output\n  **WHY:** Fixes rendering.'
    });

    expect(result.status).toBe('planned');
    expect(result.content).toContain('Historical notes.');
    expect(result.content).toContain('## Fixes');
  });

  it('detects duplicates by generated marker', () => {
    const existingContent = [
      '# Changelog',
      '',
      '<!-- PLAYBOOK:CHANGELOG_GENERATED base=v1.0.0 head=HEAD version=1.2.3 -->',
      '## Features'
    ].join('\n');

    const result = planChangelogAppend({
      existingContent,
      generatedMarkdown: '## Features\n\n- **WHAT:** Add changelog generation\n  **WHY:** Adds local release notes.',
      baseRef: 'v1.0.0',
      headRef: 'HEAD',
      version: '1.2.3'
    });

    expect(result.status).toBe('skipped');
    expect(result.duplicateDetected).toBe(true);
    expect(result.content).toBe(existingContent);
  });

  it('returns a dry-run compatible shape by planning content only', () => {
    const result = planChangelogAppend({
      existingContent: '# Changelog\n',
      generatedMarkdown: '## Chore\n\n- **WHAT:** Update release notes\n  **WHY:** Keeps maintenance current.'
    });

    expect(result.status).toBe('planned');
    expect(result.content).toContain('## Chore');
  });

  it('preserves managed markers and blocks ambiguous managed targets by default', () => {
    const existingContent = [
      '<!-- PLAYBOOK:CHANGELOG_RELEASE_NOTES_START -->',
      '## 1.0.0 - 2026-05-02',
      '<!-- PLAYBOOK:CHANGELOG_RELEASE_NOTES_END -->'
    ].join('\n');

    const result = planChangelogAppend({
      existingContent,
      generatedMarkdown: '## Features\n\n- **WHAT:** Add changelog generation\n  **WHY:** Adds local release notes.',
      targetFile: 'docs/CHANGELOG.md'
    });

    expect(result.status).toBe('blocked');
    expect(result.content).toBe(existingContent);
    expect(result.content).toContain('PLAYBOOK:CHANGELOG_RELEASE_NOTES_START');
    expect(result.content).toContain('PLAYBOOK:CHANGELOG_RELEASE_NOTES_END');
    expect(result.diagnostics[0]?.message).toContain('choose a safe generated section seam');
  });

  it('replaces a generated changelog seam without touching the managed release block', () => {
    const existingContent = [
      '# Changelog',
      '',
      '<!-- PLAYBOOK:GENERATED_CHANGELOG_START -->',
      'old generated content',
      '<!-- PLAYBOOK:GENERATED_CHANGELOG_END -->',
      '',
      '<!-- PLAYBOOK:CHANGELOG_RELEASE_NOTES_START -->',
      '## 1.0.0 - 2026-05-02',
      '<!-- PLAYBOOK:CHANGELOG_RELEASE_NOTES_END -->'
    ].join('\n');

    const result = planChangelogAppend({
      existingContent,
      generatedMarkdown: '## Features\n\n- **WHAT:** Add changelog generation\n  **WHY:** Adds local release notes.',
      targetFile: 'docs/CHANGELOG.md',
      baseRef: 'v1.0.0',
      headRef: 'HEAD'
    });

    expect(result.status).toBe('planned');
    expect(result.reason).toContain('generated changelog seam');
    expect(result.content).toContain('<!-- PLAYBOOK:GENERATED_CHANGELOG_START -->');
    expect(result.content).toContain('<!-- PLAYBOOK:GENERATED_CHANGELOG_END -->');
    expect(result.content).toContain('## Features');
    expect(result.content).toContain('PLAYBOOK:CHANGELOG_RELEASE_NOTES_START');
    expect(result.content).toContain('PLAYBOOK:CHANGELOG_RELEASE_NOTES_END');
    expect(result.content.includes('old generated content')).toBe(false);
  });

  it('blocks malformed generated seam markers', () => {
    const existingContent = [
      '# Changelog',
      '',
      '<!-- PLAYBOOK:GENERATED_CHANGELOG_START -->',
      'old generated content'
    ].join('\n');

    const result = planChangelogAppend({
      existingContent,
      generatedMarkdown: '## Features\n\n- **WHAT:** Add changelog generation\n  **WHY:** Adds local release notes.',
      targetFile: 'docs/CHANGELOG.md'
    });

    expect(result.status).toBe('blocked');
    expect(
      result.diagnostics.some((diagnostic) => diagnostic.id === 'changelog.append.generated-seam.malformed')
    ).toBe(true);
  });

  it('blocks empty generated markdown', () => {
    const result = planChangelogAppend({
      existingContent: '# Changelog\n',
      generatedMarkdown: '   '
    });

    expect(result.status).toBe('blocked');
    expect(result.diagnostics.some((diagnostic) => diagnostic.id === 'changelog.append.generated-markdown.empty')).toBe(
      true
    );
  });
});
