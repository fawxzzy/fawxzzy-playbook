import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const validatorPath = path.join(repoRoot, 'scripts', 'validate-golden-path-template-registry.mjs');
const exportFiles = [
  'playbook.golden-path-template.schema.v1.json',
  'playbook.golden-path-template.example.v1.json',
  'playbook.golden-path-template-registry.schema.v1.json',
  'playbook.golden-path-template-registry.example.v1.json'
];

const createFixture = () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-golden-path-template-registry-'));
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

test('validator accepts the committed golden-path template registry artifacts', () => {
  const fixtureRoot = createFixture();

  try {
    const result = runValidator(fixtureRoot);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /golden-path-template-registry: ok/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('validator fails when the registry omits a required template id', () => {
  const fixtureRoot = createFixture();

  try {
    const example = readFixtureJson(fixtureRoot, 'playbook.golden-path-template-registry.example.v1.json');
    example.templates = example.templates.filter((entry) => entry.id !== 'local_operator_repo');
    writeFixtureJson(fixtureRoot, 'playbook.golden-path-template-registry.example.v1.json', example);

    const result = runValidator(fixtureRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must include required template|must contain at least 3 item\(s\)/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('validator fails when a template claims scaffolding or command availability', () => {
  const fixtureRoot = createFixture();

  try {
    const example = readFixtureJson(fixtureRoot, 'playbook.golden-path-template-registry.example.v1.json');
    example.templates[0].scaffoldCommand = 'playbook scaffold template';
    writeFixtureJson(fixtureRoot, 'playbook.golden-path-template-registry.example.v1.json', example);

    const result = runValidator(fixtureRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must not claim command or scaffolding availability|unsupported property "scaffoldCommand"/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('validator fails when a template example depends on a local absolute path', () => {
  const fixtureRoot = createFixture();

  try {
    const example = readFixtureJson(fixtureRoot, 'playbook.golden-path-template.example.v1.json');
    example.template.requiredSurfaces[0] = 'C:\\ATLAS\\repos\\fawxzzy-playbook\\exports\\playbook.golden-path-template.schema.v1.json';
    writeFixtureJson(fixtureRoot, 'playbook.golden-path-template.example.v1.json', example);

    const result = runValidator(fixtureRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must not contain a local absolute path/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
