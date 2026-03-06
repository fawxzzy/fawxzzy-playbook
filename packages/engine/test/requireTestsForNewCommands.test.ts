import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { requireTestsForNewCommands } from '../src/verify/rules/requireTestsForNewCommands.js';

const createRepo = (name: string): string => fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));

describe('requireTestsForNewCommands', () => {
  it('fails when changed command module has no matching test', () => {
    const repo = createRepo('playbook-require-tests');
    const commandPath = path.join(repo, 'packages/cli/src/commands');
    fs.mkdirSync(commandPath, { recursive: true });
    fs.writeFileSync(path.join(commandPath, 'plan.ts'), 'export const runPlan = async () => 0;');

    const failures = requireTestsForNewCommands(repo, ['packages/cli/src/commands/plan.ts']);

    expect(failures).toHaveLength(1);
    expect(failures[0]?.id).toBe('verify.rule.tests.required');
    expect(failures[0]?.fix).toBe('Create packages/cli/src/commands/plan.test.ts');
  });

  it('passes when changed command module includes matching test', () => {
    const repo = createRepo('playbook-require-tests-pass');
    const commandPath = path.join(repo, 'packages/cli/src/commands');
    fs.mkdirSync(commandPath, { recursive: true });
    fs.writeFileSync(path.join(commandPath, 'plan.ts'), 'export const runPlan = async () => 0;');
    fs.writeFileSync(path.join(commandPath, 'plan.test.ts'), '');

    const failures = requireTestsForNewCommands(repo, ['packages/cli/src/commands/plan.ts']);

    expect(failures).toHaveLength(0);
  });

  it('fails when changed verify rule has no matching test', () => {
    const repo = createRepo('playbook-require-rule-tests');
    const rulePath = path.join(repo, 'packages/engine/src/verify/rules');
    fs.mkdirSync(rulePath, { recursive: true });
    fs.writeFileSync(path.join(rulePath, 'planRule.ts'), 'export const planRule = () => [];');

    const failures = requireTestsForNewCommands(repo, ['packages/engine/src/verify/rules/planRule.ts']);

    expect(failures).toHaveLength(1);
    expect(failures[0]?.fix).toBe('Create packages/engine/test/planRule.test.ts');
  });
});
