import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyExecutionPlan } from '../src/execution/index.js';
import { runDocsConsolidation } from '../src/docs/consolidate.js';
import { runDocsConsolidationPlan } from '../src/docs/consolidationPlan.js';

const createFixtureRepo = (): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-docs-consolidation-plan-'));
  fs.mkdirSync(path.join(root, '.playbook', 'orchestrator', 'workers'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.playbook', 'orchestrator', 'orchestrator.json'),
    `${JSON.stringify({
      protectedSingletonDocs: [
        {
          targetDoc: 'docs/CHANGELOG.md',
          consolidationStrategy: 'deterministic-final-pass',
          rationale: 'Canonical release/change narrative remains singleton.'
        },
        {
          targetDoc: 'docs/PLAYBOOK_PRODUCT_ROADMAP.md',
          consolidationStrategy: 'deterministic-final-pass',
          rationale: 'Roadmap rollups are protected singleton docs.'
        }
      ]
    }, null, 2)}\n`,
    'utf8'
  );
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'docs', 'CHANGELOG.md'),
    '# Changelog\n\n## Release Notes\n<!-- PLAYBOOK:CHANGELOG_RELEASE_NOTES_START -->\n- Old note.\n<!-- PLAYBOOK:CHANGELOG_RELEASE_NOTES_END -->\n',
    'utf8'
  );
  fs.writeFileSync(
    path.join(root, 'docs', 'PLAYBOOK_PRODUCT_ROADMAP.md'),
    '# Roadmap\n\n## Active Stories\n<!-- PLAYBOOK:ROADMAP_UPDATES_ANCHOR -->\n- Story A\n',
    'utf8'
  );
  return root;
};

const writeFragment = (root: string, laneId: string, fragment: Record<string, unknown>): void => {
  const laneDir = path.join(root, '.playbook', 'orchestrator', 'workers', laneId);
  fs.mkdirSync(laneDir, { recursive: true });
  fs.writeFileSync(path.join(laneDir, 'worker-fragment.json'), `${JSON.stringify(fragment, null, 2)}\n`, 'utf8');
};

const baseFragment = (overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> => ({
  schemaVersion: '1.0',
  kind: 'worker-fragment',
  lane_id: 'lane-1',
  worker_id: 'worker-1',
  fragment_id: 'fragment-1',
  created_at: '2026-03-21T00:00:00.000Z',
  target_doc: 'docs/CHANGELOG.md',
  section_key: 'release-notes',
  conflict_key: 'docs/CHANGELOG.md::release-notes',
  ordering_key: '0001:docs/CHANGELOG.md::release-notes::lane-1',
  status: 'proposed',
  summary: 'Add release note bullet for docs consolidation.',
  artifact_path: '.playbook/orchestrator/workers/lane-1/worker-fragment.json',
  content: {
    format: 'markdown',
    payload: '- Added docs consolidation plan.'
  },
  metadata: {
    integration: {
      operation: 'replace-managed-block',
      block_id: 'changelog-release-notes',
      start_marker: '<!-- PLAYBOOK:CHANGELOG_RELEASE_NOTES_START -->',
      end_marker: '<!-- PLAYBOOK:CHANGELOG_RELEASE_NOTES_END -->'
    }
  },
  ...overrides
});

describe('runDocsConsolidationPlan', () => {
  it('emits the same precondition-stamped consolidation plan for the same fragments', () => {
    const root = createFixtureRepo();
    writeFragment(root, 'lane-1', baseFragment());

    runDocsConsolidation(root);
    const first = runDocsConsolidationPlan(root);
    const firstArtifactText = fs.readFileSync(path.join(root, '.playbook', 'docs-consolidation-plan.json'), 'utf8');
    const second = runDocsConsolidationPlan(root);
    const secondArtifactText = fs.readFileSync(path.join(root, '.playbook', 'docs-consolidation-plan.json'), 'utf8');

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(firstArtifactText).toBe(secondArtifactText);
    expect(first.artifact.tasks).toHaveLength(1);
    expect(first.artifact.tasks[0]?.preconditions).toEqual({
      target_path: 'docs/CHANGELOG.md',
      target_file_fingerprint: expect.any(String),
      managed_block_fingerprint: expect.any(String),
      approved_fragment_ids: ['fragment-1'],
      planned_operation: 'replace-managed-block'
    });
  });

  it('keeps conflicting or missing-anchor targets excluded and non-executable', () => {
    const root = createFixtureRepo();
    writeFragment(root, 'lane-1', baseFragment());
    writeFragment(
      root,
      'lane-2',
      baseFragment({
        lane_id: 'lane-2',
        worker_id: 'worker-2',
        fragment_id: 'fragment-2',
        target_doc: 'docs/PLAYBOOK_PRODUCT_ROADMAP.md',
        section_key: 'roadmap',
        conflict_key: 'docs/PLAYBOOK_PRODUCT_ROADMAP.md::roadmap',
        ordering_key: '0002:docs/PLAYBOOK_PRODUCT_ROADMAP.md::roadmap::lane-2',
        artifact_path: '.playbook/orchestrator/workers/lane-2/worker-fragment.json',
        summary: 'Add roadmap rollup note.',
        metadata: {
          integration: {
            operation: 'insert-under-anchor',
            block_id: 'roadmap-rollup',
            start_marker: '<!-- PLAYBOOK:ROADMAP_ROLLUP_START -->',
            end_marker: '<!-- PLAYBOOK:ROADMAP_ROLLUP_END -->',
            anchor: '<!-- PLAYBOOK:ROADMAP_UPDATES_ANCHOR -->'
          }
        }
      })
    );

    fs.writeFileSync(path.join(root, 'docs', 'PLAYBOOK_PRODUCT_ROADMAP.md'), '# Roadmap\n\n## Active Stories\n- Story A\n', 'utf8');
    runDocsConsolidation(root);
    const result = runDocsConsolidationPlan(root);

    expect(result.ok).toBe(false);
    expect(result.artifact.tasks).toHaveLength(1);
    expect(result.artifact.excluded).toEqual([
      expect.objectContaining({ target_doc: 'docs/PLAYBOOK_PRODUCT_ROADMAP.md', reason: 'missing-anchor' })
    ]);
  });

  it('applies only the targeted protected managed block through apply when reviewed preconditions still match', async () => {
    const root = createFixtureRepo();
    writeFragment(root, 'lane-1', baseFragment());
    runDocsConsolidation(root);
    const plan = runDocsConsolidationPlan(root);

    const beforeRoadmap = fs.readFileSync(path.join(root, 'docs', 'PLAYBOOK_PRODUCT_ROADMAP.md'), 'utf8');
    const result = await applyExecutionPlan(root, plan.artifact.tasks, { dryRun: false });
    const afterChangelog = fs.readFileSync(path.join(root, 'docs', 'CHANGELOG.md'), 'utf8');
    const afterRoadmap = fs.readFileSync(path.join(root, 'docs', 'PLAYBOOK_PRODUCT_ROADMAP.md'), 'utf8');

    expect(result.summary).toEqual({ applied: 1, skipped: 0, unsupported: 0, failed: 0 });
    expect(afterChangelog).toContain('- Added docs consolidation plan.');
    expect(afterRoadmap).toBe(beforeRoadmap);
  });

  it('fails closed without mutating the conflicted target when the reviewed target drifts', async () => {
    const root = createFixtureRepo();
    writeFragment(root, 'lane-1', baseFragment());
    runDocsConsolidation(root);
    const plan = runDocsConsolidationPlan(root);
    const targetPath = path.join(root, 'docs', 'CHANGELOG.md');
    const reviewedText = fs.readFileSync(targetPath, 'utf8');
    fs.writeFileSync(targetPath, reviewedText.replace('- Old note.', '- Drifted note.'), 'utf8');

    const result = await applyExecutionPlan(root, plan.artifact.tasks, { dryRun: false });
    const afterText = fs.readFileSync(targetPath, 'utf8');

    expect(result.summary).toEqual({ applied: 0, skipped: 0, unsupported: 0, failed: 1 });
    expect(result.results[0]).toEqual(expect.objectContaining({
      status: 'failed',
      message: expect.stringContaining('target-drift-detected')
    }));
    expect(afterText).toContain('- Drifted note.');
    expect(afterText).not.toContain('- Added docs consolidation plan.');
  });

  it('fails closed on anchor drift without partially mutating the conflicted target', async () => {
    const root = createFixtureRepo();
    writeFragment(
      root,
      'lane-2',
      baseFragment({
        lane_id: 'lane-2',
        worker_id: 'worker-2',
        fragment_id: 'fragment-2',
        target_doc: 'docs/PLAYBOOK_PRODUCT_ROADMAP.md',
        section_key: 'roadmap',
        conflict_key: 'docs/PLAYBOOK_PRODUCT_ROADMAP.md::roadmap',
        ordering_key: '0002:docs/PLAYBOOK_PRODUCT_ROADMAP.md::roadmap::lane-2',
        artifact_path: '.playbook/orchestrator/workers/lane-2/worker-fragment.json',
        summary: 'Add roadmap rollup note.',
        content: { format: 'markdown', payload: '- Added roadmap note.' },
        metadata: {
          integration: {
            operation: 'insert-under-anchor',
            block_id: 'roadmap-rollup',
            start_marker: '<!-- PLAYBOOK:ROADMAP_ROLLUP_START -->',
            end_marker: '<!-- PLAYBOOK:ROADMAP_ROLLUP_END -->',
            anchor: '<!-- PLAYBOOK:ROADMAP_UPDATES_ANCHOR -->'
          }
        }
      })
    );

    runDocsConsolidation(root);
    const plan = runDocsConsolidationPlan(root);
    const roadmapTask = plan.artifact.tasks.find((task) => task.file === 'docs/PLAYBOOK_PRODUCT_ROADMAP.md');
    expect(roadmapTask?.preconditions.anchor_context_hash).toEqual(expect.any(String));

    const targetPath = path.join(root, 'docs', 'PLAYBOOK_PRODUCT_ROADMAP.md');
    const reviewedText = fs.readFileSync(targetPath, 'utf8');
    fs.writeFileSync(targetPath, reviewedText.replace('<!-- PLAYBOOK:ROADMAP_UPDATES_ANCHOR -->', '<!-- PLAYBOOK:ROADMAP_UPDATES_MOVED -->'), 'utf8');

    const result = await applyExecutionPlan(root, [roadmapTask!], { dryRun: false });
    const afterText = fs.readFileSync(targetPath, 'utf8');

    expect(result.summary).toEqual({ applied: 0, skipped: 0, unsupported: 0, failed: 1 });
    expect(result.results[0]?.message).toContain('target-drift-detected');
    expect(afterText).toContain('<!-- PLAYBOOK:ROADMAP_UPDATES_MOVED -->');
    expect(afterText).not.toContain('<!-- PLAYBOOK:ROADMAP_ROLLUP_START -->');
  });
});
