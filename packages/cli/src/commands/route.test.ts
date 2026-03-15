import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ExitCode } from '../lib/cliContract.js';

const routeTask = vi.fn();
const buildExecutionPlan = vi.fn();

vi.mock('@zachariahredfield/playbook-engine', () => ({ routeTask, buildExecutionPlan }));

describe('runRoute', () => {
  it('emits deterministic json route output with execution plan proposal', async () => {
    const { runRoute } = await import('./route.js');
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-route-'));
    fs.mkdirSync(path.join(repo, '.playbook'), { recursive: true });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    routeTask.mockReturnValue({
      route: 'deterministic_local',
      why: 'Artifact read tasks are deterministic.',
      requiredInputs: ['task kind'],
      missingPrerequisites: [],
      repoMutationAllowed: false
    });

    buildExecutionPlan.mockReturnValue({
      schemaVersion: '1.0',
      kind: 'execution-plan',
      generatedAt: '1970-01-01T00:00:00.000Z',
      proposalOnly: true,
      task_family: 'artifact_read',
      route_id: 'deterministic_local:artifact_read',
      rule_packs: ['route-deterministic-local'],
      required_validations: ['pnpm -r build'],
      optional_validations: ['pnpm playbook route "<task>" --json'],
      parallel_lanes: ['deterministic-inspection'],
      mutation_allowed: false,
      missing_prerequisites: [],
      sourceArtifacts: {
        taskExecutionProfile: { available: false, artifactPath: '.playbook/task-execution-profile.json' },
        learningState: { available: false, artifactPath: '.playbook/learning-state.json' }
      },
      warnings: []
    });

    const exitCode = await runRoute(repo, ['summarize', 'current', 'repo', 'state'], { format: 'json', quiet: false });

    expect(exitCode).toBe(ExitCode.Success);
    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0]));
    expect(payload.command).toBe('route');
    expect(payload.selectedRoute).toBe('deterministic_local');
    expect(payload.task).toBe('summarize current repo state');
    expect(payload.executionPlan.kind).toBe('execution-plan');

    const persisted = JSON.parse(fs.readFileSync(path.join(repo, '.playbook', 'execution-plan.json'), 'utf8'));
    expect(persisted.kind).toBe('execution-plan');

    logSpy.mockRestore();
    fs.rmSync(repo, { recursive: true, force: true });
  });
});
