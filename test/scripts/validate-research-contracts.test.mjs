import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const validatorPath = path.join(repoRoot, 'scripts', 'validate-research-contracts.mjs');
const exportFiles = [
  'playbook.research.project-profile.schema.v1.json',
  'playbook.research.project-profile.example.v1.json',
  'playbook.research.pattern-set.schema.v1.json',
  'playbook.research.pattern-set.example.v1.json',
  'playbook.research.integration-map.schema.v1.json',
  'playbook.research.integration-map.example.v1.json',
  'playbook.research.roadmap-diff.schema.v1.json',
  'playbook.research.roadmap-diff.example.v1.json'
];

const createFixture = () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-research-contracts-'));
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

test('validator accepts the committed research contract artifacts', () => {
  const fixtureRoot = createFixture();

  try {
    const result = runValidator(fixtureRoot);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /research-contracts: ok/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('validator fails when pattern rows use unsupported classifications', () => {
  const fixtureRoot = createFixture();

  try {
    const example = readFixtureJson(fixtureRoot, 'playbook.research.pattern-set.example.v1.json');
    example.patterns[0].classification = 'Heuristic';
    writeFixtureJson(fixtureRoot, 'playbook.research.pattern-set.example.v1.json', example);

    const result = runValidator(fixtureRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /(must be one of|must include at least one Pattern row)/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('validator fails when integration-map entries omit minimal implementation detail', () => {
  const fixtureRoot = createFixture();

  try {
    const example = readFixtureJson(fixtureRoot, 'playbook.research.integration-map.example.v1.json');
    example.entries[0].minimalImplementation = '';
    writeFixtureJson(fixtureRoot, 'playbook.research.integration-map.example.v1.json', example);

    const result = runValidator(fixtureRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /minimalImplementation/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('validator fails when roadmap-diff entries claim command availability', () => {
  const fixtureRoot = createFixture();

  try {
    const example = readFixtureJson(fixtureRoot, 'playbook.research.roadmap-diff.example.v1.json');
    example.entries[0].commandAvailability = 'implemented';
    writeFixtureJson(fixtureRoot, 'playbook.research.roadmap-diff.example.v1.json', example);

    const result = runValidator(fixtureRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /(must not claim command availability|unsupported property "commandAvailability")/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('validator fails when examples depend on local absolute paths', () => {
  const fixtureRoot = createFixture();

  try {
    const example = readFixtureJson(fixtureRoot, 'playbook.research.roadmap-diff.example.v1.json');
    example.entries[0].reviewSource = 'C:\\ATLAS\\repos\\fawxzzy-playbook\\docs\\roadmap\\WAVE_ONE_EXTERNAL_RESEARCH_ROADMAP_2026-05-03.md';
    writeFixtureJson(fixtureRoot, 'playbook.research.roadmap-diff.example.v1.json', example);

    const result = runValidator(fixtureRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must not contain a local absolute path|reviewSource must be a repo-relative path/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
