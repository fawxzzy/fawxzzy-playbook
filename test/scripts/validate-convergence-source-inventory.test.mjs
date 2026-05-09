import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const validatorPath = path.join(repoRoot, 'scripts', 'validate-convergence-source-inventory.mjs');
const schemaSourcePath = path.join(repoRoot, 'exports', 'playbook.convergence.source-inventory.schema.v1.json');
const exampleSourcePath = path.join(repoRoot, 'exports', 'playbook.convergence.source-inventory.example.v1.json');

const createFixture = () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-convergence-source-inventory-'));
  const exportsDir = path.join(fixtureRoot, 'exports');
  fs.mkdirSync(exportsDir, { recursive: true });
  fs.copyFileSync(schemaSourcePath, path.join(exportsDir, 'playbook.convergence.source-inventory.schema.v1.json'));
  fs.copyFileSync(exampleSourcePath, path.join(exportsDir, 'playbook.convergence.source-inventory.example.v1.json'));
  return fixtureRoot;
};

const readFixtureExample = (fixtureRoot) =>
  JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'exports', 'playbook.convergence.source-inventory.example.v1.json'), 'utf8'));

const writeFixtureExample = (fixtureRoot, example) => {
  fs.writeFileSync(
    path.join(fixtureRoot, 'exports', 'playbook.convergence.source-inventory.example.v1.json'),
    JSON.stringify(example, null, 2) + '\n',
    'utf8'
  );
};

const runValidator = (fixtureRoot) =>
  spawnSync('node', [validatorPath], {
    cwd: fixtureRoot,
    encoding: 'utf8'
  });

test('validator accepts the committed convergence source inventory artifact pair', () => {
  const fixtureRoot = createFixture();

  try {
    const result = runValidator(fixtureRoot);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /convergence-source-inventory: ok/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('validator fails closed on duplicate source ids', () => {
  const fixtureRoot = createFixture();

  try {
    const example = readFixtureExample(fixtureRoot);
    example.sources[1].id = example.sources[0].id;
    writeFixtureExample(fixtureRoot, example);

    const result = runValidator(fixtureRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must be unique/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('validator fails when migrate or template rows omit a proposed destination', () => {
  const fixtureRoot = createFixture();

  try {
    const example = readFixtureExample(fixtureRoot);
    example.sources[2].targetSurface = '';
    writeFixtureExample(fixtureRoot, example);

    const result = runValidator(fixtureRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /targetSurface is required/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('validator fails when a source row claims command availability', () => {
  const fixtureRoot = createFixture();

  try {
    const example = readFixtureExample(fixtureRoot);
    example.sources[0].commandAvailability = 'implemented';
    writeFixtureExample(fixtureRoot, example);

    const result = runValidator(fixtureRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /(must not claim command availability|unsupported property "commandAvailability")/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
