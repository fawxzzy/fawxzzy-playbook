import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const validatorPath = path.join(repoRoot, 'scripts', 'validate-workflow-pack-environment-bridge-executor.mjs');
const exportFiles = [
  'playbook.workflow-pack.environment-bridge.executor.schema.v1.json',
  'playbook.workflow-pack.environment-bridge.executor.example.v1.json',
  'playbook.workflow-pack.environment-bridge.executor-receipt.schema.v1.json',
  'playbook.workflow-pack.environment-bridge.executor-receipt.example.v1.json'
];

const createFixture = () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-workflow-pack-environment-bridge-executor-'));
  const exportsDir = path.join(fixtureRoot, 'exports');
  fs.mkdirSync(exportsDir, { recursive: true });

  for (const fileName of exportFiles) {
    fs.copyFileSync(path.join(repoRoot, 'exports', fileName), path.join(exportsDir, fileName));
  }

  return fixtureRoot;
};

const readFixtureJson = (fixtureRoot, fileName) =>
  JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'exports', fileName), 'utf8'));

const writeFixtureJson = (fixtureRoot, fileName, value) => {
  fs.writeFileSync(path.join(fixtureRoot, 'exports', fileName), JSON.stringify(value, null, 2) + '\n', 'utf8');
};

const runValidator = (fixtureRoot) =>
  spawnSync('node', [validatorPath], {
    cwd: fixtureRoot,
    encoding: 'utf8'
  });

test('validator accepts the committed workflow-pack environment bridge executor artifacts', () => {
  const fixtureRoot = createFixture();

  try {
    const result = runValidator(fixtureRoot);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /workflow-pack-environment-bridge-executor: ok/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('validator fails when requiredSecretRefs embed a raw secret value', () => {
  const fixtureRoot = createFixture();

  try {
    const example = readFixtureJson(fixtureRoot, 'playbook.workflow-pack.environment-bridge.executor.example.v1.json');
    example.requiredSecretRefs[0] = 'ghp_not_a_ref';
    writeFixtureJson(fixtureRoot, 'playbook.workflow-pack.environment-bridge.executor.example.v1.json', example);

    const result = runValidator(fixtureRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /requiredSecretRefs\[0\] must use a provider-neutral secret ref|must match pattern/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('validator fails when apply_requested does not require approval', () => {
  const fixtureRoot = createFixture();

  try {
    const example = readFixtureJson(fixtureRoot, 'playbook.workflow-pack.environment-bridge.executor.example.v1.json');
    example.executionMode = 'apply_requested';
    example.approvalRequired = false;
    writeFixtureJson(fixtureRoot, 'playbook.workflow-pack.environment-bridge.executor.example.v1.json', example);

    const result = runValidator(fixtureRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /apply_requested executionMode requires approvalRequired=true/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('validator fails when allowedMutationTargets are not explicit and finite', () => {
  const fixtureRoot = createFixture();

  try {
    const example = readFixtureJson(fixtureRoot, 'playbook.workflow-pack.environment-bridge.executor.example.v1.json');
    example.allowedMutationTargets[0] = '*';
    writeFixtureJson(fixtureRoot, 'playbook.workflow-pack.environment-bridge.executor.example.v1.json', example);

    const result = runValidator(fixtureRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /allowedMutationTargets\[0\] must remain explicit and finite/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('validator fails when the executor contract claims workflow availability', () => {
  const fixtureRoot = createFixture();

  try {
    const example = readFixtureJson(fixtureRoot, 'playbook.workflow-pack.environment-bridge.executor.example.v1.json');
    example.workflowAvailability = 'ready';
    writeFixtureJson(fixtureRoot, 'playbook.workflow-pack.environment-bridge.executor.example.v1.json', example);

    const result = runValidator(fixtureRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must not claim command or workflow availability|unsupported property "workflowAvailability"/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('validator fails when receipt refs use a local absolute path', () => {
  const fixtureRoot = createFixture();

  try {
    const receipt = readFixtureJson(fixtureRoot, 'playbook.workflow-pack.environment-bridge.executor-receipt.example.v1.json');
    receipt.receiptRefs[0] = 'C:\\ATLAS\\repos\\fawxzzy-playbook\\.playbook\\executor-receipt.json';
    writeFixtureJson(fixtureRoot, 'playbook.workflow-pack.environment-bridge.executor-receipt.example.v1.json', receipt);

    const result = runValidator(fixtureRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must not contain a local absolute path|must use a repo-relative ref/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
