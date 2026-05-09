import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const validatorPath = path.join(repoRoot, 'scripts', 'validate-workflow-pack-environment-bridge.mjs');
const exportFiles = [
  'playbook.workflow-pack.environment-bridge.schema.v1.json',
  'playbook.workflow-pack.environment-bridge.example.v1.json'
];

const createFixture = () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-workflow-pack-environment-bridge-'));
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

test('validator accepts the committed workflow-pack environment bridge artifact', () => {
  const fixtureRoot = createFixture();

  try {
    const result = runValidator(fixtureRoot);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /workflow-pack-environment-bridge: ok/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('validator fails when requiredSecrets embed a raw secret value', () => {
  const fixtureRoot = createFixture();

  try {
    const example = readFixtureJson(fixtureRoot, 'playbook.workflow-pack.environment-bridge.example.v1.json');
    example.requiredSecrets[0] = 'ghp_not_a_ref';
    writeFixtureJson(fixtureRoot, 'playbook.workflow-pack.environment-bridge.example.v1.json', example);

    const result = runValidator(fixtureRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /requiredSecrets\[0\] must use a provider-neutral secret ref|must match pattern/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('validator fails when the artifact claims workflow or command availability', () => {
  const fixtureRoot = createFixture();

  try {
    const example = readFixtureJson(fixtureRoot, 'playbook.workflow-pack.environment-bridge.example.v1.json');
    example.workflowFile = '.github/workflows/publish.yml';
    writeFixtureJson(fixtureRoot, 'playbook.workflow-pack.environment-bridge.example.v1.json', example);

    const result = runValidator(fixtureRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must not claim workflow or command availability|unsupported property "workflowFile"/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('validator fails when receipt refs use a local absolute path', () => {
  const fixtureRoot = createFixture();

  try {
    const example = readFixtureJson(fixtureRoot, 'playbook.workflow-pack.environment-bridge.example.v1.json');
    example.receiptRefs[0] = 'C:\\ATLAS\\repos\\fawxzzy-playbook\\.playbook\\local-verification-receipt.json';
    writeFixtureJson(fixtureRoot, 'playbook.workflow-pack.environment-bridge.example.v1.json', example);

    const result = runValidator(fixtureRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must not contain a local absolute path|must use a repo-relative ref/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
