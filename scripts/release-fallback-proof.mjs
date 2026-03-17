#!/usr/bin/env node
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_OWNER = 'ZachariahRedfield';
const DEFAULT_REPO = 'playbook';

const parseArgs = () => {
  const args = process.argv.slice(2);
  const result = {
    owner: DEFAULT_OWNER,
    repo: DEFAULT_REPO,
    version: '',
    consumerRepo: '',
    json: false
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--version') result.version = args[++i] ?? '';
    else if (arg === '--owner') result.owner = args[++i] ?? DEFAULT_OWNER;
    else if (arg === '--repo') result.repo = args[++i] ?? DEFAULT_REPO;
    else if (arg === '--consumer-repo') result.consumerRepo = args[++i] ?? '';
    else if (arg === '--json') result.json = true;
    else if (arg === '--help') {
      process.stdout.write(
        [
          'Usage: node scripts/release-fallback-proof.mjs --version <x.y.z> [--consumer-repo <path>] [--json]',
          '',
          'Verifies Playbook release fallback tarball provisioning and (optionally) runs consumer fallback smoke checks.',
          'Constructed URL: https://github.com/<owner>/<repo>/releases/download/v<version>/playbook-cli-<version>.tgz'
        ].join('\n') + '\n'
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!result.version) throw new Error('--version is required');
  return result;
};

const run = (cmd, args, cwd = process.cwd()) => {
  const startedAt = Date.now();
  const child = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  const endedAt = Date.now();
  return {
    ok: child.status === 0,
    status: child.status,
    stdout: child.stdout,
    stderr: child.stderr,
    command: `${cmd} ${args.join(' ')}`,
    startedAt,
    endedAt
  };
};

const classifyArtifactFailure = ({ exists, parseError, schemaError, stale }) => {
  if (!exists) return 'missing_prerequisite_artifact';
  if (parseError || schemaError) return 'invalid_artifact';
  if (stale) return 'stale_artifact';
  return null;
};

const validateArtifactSchema = (parsed, schema) => {
  if (!schema) return null;
  if (schema.kind === 'repo-graph') {
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.edges)) {
      return 'Expected JSON object with an edges array.';
    }
    return null;
  }

  if (schema.kind === 'plan') {
    if (!parsed || typeof parsed !== 'object') {
      return 'Expected JSON object.';
    }
    if (parsed.command !== 'plan') {
      return 'Expected command field to equal "plan".';
    }
    return null;
  }

  return null;
};

export const evaluateArtifactContracts = ({ repoRoot, contracts, producerRuns = {} }) =>
  contracts.map((contract) => {
    const absolutePath = path.join(repoRoot, contract.path);
    const producerRun = producerRuns[contract.producerKey] ?? null;
    const exists = existsSync(absolutePath);

    let parseError = null;
    let schemaError = null;
    let stale = false;

    if (exists) {
      try {
        const parsed = JSON.parse(readFileSync(absolutePath, 'utf8'));
        schemaError = validateArtifactSchema(parsed, contract.schema);
      } catch (error) {
        parseError = error instanceof Error ? error.message : String(error);
      }

      if (producerRun?.startedAt) {
        stale = statSync(absolutePath).mtimeMs < producerRun.startedAt;
      }
    }

    const failureType = classifyArtifactFailure({ exists, parseError, schemaError, stale });
    const reason =
      failureType === 'missing_prerequisite_artifact'
        ? `Artifact not found at ${contract.path}.`
        : failureType === 'stale_artifact'
          ? `Artifact exists but predates producer command ${contract.producerCommand}.`
          : failureType === 'invalid_artifact'
            ? `Artifact JSON/schema validation failed for ${contract.path}.`
            : null;

    const details = [parseError, schemaError].filter(Boolean).join(' ');

    return {
      name: `artifact assertion: ${contract.path}`,
      ok: failureType === null,
      command: `test -f ${contract.path}`,
      status: failureType === null ? 0 : 1,
      artifactPath: contract.path,
      failureType,
      reason: reason ?? undefined,
      expectedProducerCommand: contract.producerCommand,
      remediation: contract.remediation,
      severity: contract.severity,
      details: details || undefined
    };
  });

const main = async () => {
  const options = parseArgs();
  const assetUrl = `https://github.com/${options.owner}/${options.repo}/releases/download/v${options.version}/playbook-cli-${options.version}.tgz`;

  const tmp = mkdtempSync(path.join(os.tmpdir(), 'playbook-release-fallback-proof-'));
  const tarPath = path.join(tmp, `playbook-cli-${options.version}.tgz`);

  const download = run('curl', ['-sSfL', assetUrl, '-o', tarPath]);
  const inspect = download.ok ? run('tar', ['-tzf', tarPath]) : { ok: false, command: 'tar -tzf <downloaded-tarball>' };

  const checks = [
    { name: 'release asset download', ...download },
    { name: 'release asset tar inspection', ...inspect }
  ];

  if (options.consumerRepo) {
    const specValue = `@${assetUrl}`;
    const envPath = path.join(options.consumerRepo, '.env.playbook-fallback-proof');
    writeFileSync(envPath, `PLAYBOOK_OFFICIAL_FALLBACK_SPEC=${specValue}\n`, 'utf8');

    const install = { name: 'consumer npm install', ...run('npm', ['install'], options.consumerRepo) };
    const packageMiss = {
      name: 'consumer package acquisition attempt',
      ...run('npm', ['install', '@fawxzzy/playbook-cli@9999.0.0'], options.consumerRepo)
    };
    const fallbackInstall = {
      name: 'consumer fallback acquisition from release tarball',
      ...run('npm', ['install', '--no-save', specValue], options.consumerRepo)
    };
    const index = {
      name: 'consumer prerequisite: index',
      ...run('npx', ['playbook', 'index', '--json'], options.consumerRepo)
    };
    const verify = {
      name: 'consumer canonical ladder: verify',
      ...run('npx', ['playbook', 'verify', '--json'], options.consumerRepo)
    };
    const plan = {
      name: 'consumer canonical ladder: plan',
      ...run('npx', ['playbook', 'plan', '--json'], options.consumerRepo)
    };
    const apply = {
      name: 'consumer canonical ladder: apply',
      ...run('npx', ['playbook', 'apply', '--json'], options.consumerRepo)
    };

    checks.push(install, packageMiss, fallbackInstall, index, verify, plan, apply);

    const artifactContracts = [
      {
        path: '.playbook/repo-graph.json',
        producerKey: 'index',
        producerCommand: 'npx playbook index --json',
        remediation: 'Run "npx playbook index --json" in the consumer repository before rerunning fallback proof.',
        severity: 'setup_precondition_fail',
        schema: { kind: 'repo-graph' }
      },
      {
        path: '.playbook/plan.json',
        producerKey: 'plan',
        producerCommand: 'npx playbook plan --json',
        remediation: 'Run "npx playbook verify --json" then "npx playbook plan --json" in the consumer repository before rerunning fallback proof.',
        severity: 'hard_fail',
        schema: { kind: 'plan' }
      }
    ];

    checks.push(
      ...evaluateArtifactContracts({
        repoRoot: options.consumerRepo,
        contracts: artifactContracts,
        producerRuns: {
          index,
          plan
        }
      })
    );
  }

  const ok = checks.every((item) => item.ok);
  if (options.json) {
    process.stdout.write(
      JSON.stringify(
        {
          ok,
          version: options.version,
          assetUrl,
          checks: checks.map((item) => ({
            name: item.name,
            ok: item.ok,
            command: item.command,
            status: item.status ?? null,
            stdout: item.stdout?.trim() || undefined,
            stderr: item.stderr?.trim() || undefined,
            artifactPath: item.artifactPath,
            failureType: item.failureType,
            reason: item.reason,
            expectedProducerCommand: item.expectedProducerCommand,
            remediation: item.remediation,
            severity: item.severity,
            details: item.details
          }))
        },
        null,
        2
      ) + '\n'
    );
  } else {
    for (const item of checks) {
      process.stdout.write(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}: ${item.command}\n`);
      if (!item.ok && item.artifactPath) {
        process.stdout.write(
          `  -> ${item.failureType} [${item.severity}] at ${item.artifactPath}; producer: ${item.expectedProducerCommand}\n`
        );
        process.stdout.write(`  -> remediation: ${item.remediation}\n`);
      }
    }
    process.stdout.write(`Asset URL: ${assetUrl}\n`);
  }

  rmSync(tmp, { recursive: true, force: true });
  if (!ok) process.exit(1);
};

const isDirectExecution = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
