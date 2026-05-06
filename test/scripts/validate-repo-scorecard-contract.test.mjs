import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const validatorPath = path.join(repoRoot, 'scripts', 'validate-repo-scorecard-contract.mjs');
const exportFiles = [
  'playbook.repo-scorecard.schema.v1.json',
  'playbook.repo-scorecard.example.v1.json'
];

const createFixture = () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-repo-scorecard-'));
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

test('validator accepts the committed repo scorecard contract artifacts', () => {
  const fixtureRoot = createFixture();

  try {
    const result = runValidator(fixtureRoot);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /repo-scorecard-contract: ok/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('validator fails when a required dimension is missing', () => {
  const fixtureRoot = createFixture();

  try {
    const example = readFixtureJson(fixtureRoot, 'playbook.repo-scorecard.example.v1.json');
    example.dimensions = example.dimensions.filter((dimension) => dimension.id !== 'roadmap_governance');
    writeFixtureJson(fixtureRoot, 'playbook.repo-scorecard.example.v1.json', example);

    const result = runValidator(fixtureRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /dimensions must contain exactly|missing required dimension|must contain at least 8 item\(s\)/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('validator fails when evidence uses a local absolute path', () => {
  const fixtureRoot = createFixture();

  try {
    const example = readFixtureJson(fixtureRoot, 'playbook.repo-scorecard.example.v1.json');
    example.dimensions[0].evidence[0] = 'C:\\ATLAS\\repos\\fawxzzy-playbook\\docs\\contracts\\PLAYBOOK-CONTRACT.md';
    writeFixtureJson(fixtureRoot, 'playbook.repo-scorecard.example.v1.json', example);

    const result = runValidator(fixtureRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must not contain a local absolute path|must use repo-relative paths/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('validator fails when a dimension claims command availability', () => {
  const fixtureRoot = createFixture();

  try {
    const example = readFixtureJson(fixtureRoot, 'playbook.repo-scorecard.example.v1.json');
    example.dimensions[0].commandAvailability = 'implemented';
    writeFixtureJson(fixtureRoot, 'playbook.repo-scorecard.example.v1.json', example);

    const result = runValidator(fixtureRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /(must not claim command availability|unsupported property "commandAvailability")/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('validator fails when summary counts drift from dimension statuses', () => {
  const fixtureRoot = createFixture();

  try {
    const example = readFixtureJson(fixtureRoot, 'playbook.repo-scorecard.example.v1.json');
    example.summary.verified = 99;
    writeFixtureJson(fixtureRoot, 'playbook.repo-scorecard.example.v1.json', example);

    const result = runValidator(fixtureRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /summary\.verified/);
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
