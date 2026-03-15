import { describe, expect, it } from 'vitest';
import { buildExecutionPlan } from '../src/routing/executionPlan.js';

describe('buildExecutionPlan', () => {
  it('builds deterministic proposal-only execution plan and degrades when artifacts are missing', () => {
    const plan = buildExecutionPlan({
      task: 'summarize current repo state',
      decision: {
        route: 'deterministic_local',
        why: 'Artifact read tasks are deterministic.',
        requiredInputs: ['task kind'],
        missingPrerequisites: [],
        repoMutationAllowed: false
      },
      generatedAt: '2026-01-01T00:00:00.000Z',
      sourceArtifacts: {
        taskExecutionProfile: { available: false, artifactPath: '.playbook/task-execution-profile.json' },
        learningState: { available: false, artifactPath: '.playbook/learning-state.json' }
      }
    });

    expect(plan).toMatchObject({
      schemaVersion: '1.0',
      kind: 'execution-plan',
      proposalOnly: true,
      task_family: 'artifact_read',
      route_id: 'deterministic_local:artifact_read',
      mutation_allowed: false
    });
    expect(plan.rule_packs).toEqual(['route-deterministic-local']);
    expect(plan.warnings).toEqual([
      'learning-state artifact unavailable; skipping learning-state refinement and using deterministic baseline route defaults.',
      'task-execution-profile artifact unavailable; using route defaults for governance packs and validation bundles.'
    ]);
  });
});
