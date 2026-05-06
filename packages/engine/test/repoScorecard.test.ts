import { describe, expect, it } from 'vitest';
import {
  buildRepoScorecardReport,
  deriveRepoScorecardGrade,
  scoreRepoScorecardDimensionStatus,
  validateRepoScorecardId,
  type RepoScorecardInput
} from '../src/scorecard/index.js';

const baseInput = (): RepoScorecardInput => ({
  repo: {
    id: 'fawxzzy-playbook',
    role: 'governance_owner'
  },
  summary: {
    verified: 5,
    partial: 3,
    missing: 0,
    notApplicable: 0
  },
  dimensions: [
    {
      id: 'owner_truth',
      title: 'Owner truth',
      status: 'verified',
      summary: 'Canonical contract and roadmap owner surfaces are published and versioned.',
      evidence: ['docs/contracts/PLAYBOOK-CONTRACT.md', 'docs/roadmap/ROADMAP.json']
    },
    {
      id: 'command_truth',
      title: 'Command truth',
      status: 'verified',
      summary: 'Live command inventory remains owned by command docs rather than roadmap prose.',
      evidence: ['docs/commands/README.md', 'AGENTS.md']
    },
    {
      id: 'verification_truth',
      title: 'Verification truth',
      status: 'verified',
      summary: 'The repo carries deterministic verification contracts and root validation gates.',
      evidence: ['scripts/validate-roadmap-contract.mjs', 'docs/contracts/COMMAND_CONTRACTS_V1.md']
    },
    {
      id: 'artifact_hygiene',
      title: 'Artifact hygiene',
      status: 'partial',
      summary: 'Artifact refs are increasingly canonicalized, but not every output family is scored yet.',
      evidence: ['exports/playbook.contract.schema.v1.json', 'exports/playbook.research.project-profile.schema.v1.json'],
      nextAction: 'Expand scorecard coverage to report-only artifact families after contract checks stabilize.'
    },
    {
      id: 'docs_governance',
      title: 'Docs governance',
      status: 'partial',
      summary: 'Docs audit is enforced, with one known warning still tracked separately.',
      evidence: ['AGENTS.md', 'docs/roadmap/README.md'],
      nextAction: 'Keep the AGENTS planning-language warning scoped to a separate cleanup lane.'
    },
    {
      id: 'workflow_pack_adoption',
      title: 'Workflow-pack adoption',
      status: 'partial',
      summary: 'Workflow-pack doctrine exists, but the environment-bridge contract is still a later slice.',
      evidence: ['docs/contracts/WORKFLOW_PACK_REUSE_CONTRACT.md', 'docs/roadmap/WAVE_ONE_EXTERNAL_RESEARCH_ROADMAP_2026-05-03.md'],
      nextAction: 'Land the workflow-pack environment bridge contract before grading this dimension as verified.'
    },
    {
      id: 'local_verification',
      title: 'Local verification',
      status: 'verified',
      summary: 'Local verification receipts and evidence flows are already modeled explicitly.',
      evidence: ['docs/contracts/LOCAL_VERIFICATION_RECEIPT_CONTRACT.md', '.playbook/local-verification-receipt.json']
    },
    {
      id: 'roadmap_governance',
      title: 'Roadmap governance',
      status: 'verified',
      summary: 'Feature sequencing, status semantics, and roadmap validation are governed by contract.',
      evidence: ['docs/roadmap/ROADMAP.json', 'scripts/validate-roadmap-contract.mjs']
    }
  ]
});

describe('repo scorecard report', () => {
  it('builds a deterministic report from explicit scorecard evidence', () => {
    const report = buildRepoScorecardReport({
      ...baseInput(),
      dimensions: [
        baseInput().dimensions[3],
        baseInput().dimensions[1],
        baseInput().dimensions[4],
        baseInput().dimensions[6],
        baseInput().dimensions[0],
        baseInput().dimensions[7],
        baseInput().dimensions[2],
        baseInput().dimensions[5]
      ]
    });

    expect(report).toEqual({
      schemaVersion: 'playbook.repo-scorecard.report.v1',
      status: 'ok',
      repo: {
        id: 'fawxzzy-playbook',
        role: 'governance_owner'
      },
      summary: {
        score: 13,
        maxScore: 16,
        grade: 'b'
      },
      dimensions: [
        {
          id: 'artifact_hygiene',
          title: 'Artifact hygiene',
          status: 'partial',
          score: 1,
          maxScore: 2,
          summary: 'Artifact refs are increasingly canonicalized, but not every output family is scored yet.',
          evidence: ['exports/playbook.contract.schema.v1.json', 'exports/playbook.research.project-profile.schema.v1.json'],
          nextAction: 'Expand scorecard coverage to report-only artifact families after contract checks stabilize.'
        },
        {
          id: 'command_truth',
          title: 'Command truth',
          status: 'verified',
          score: 2,
          maxScore: 2,
          summary: 'Live command inventory remains owned by command docs rather than roadmap prose.',
          evidence: ['docs/commands/README.md', 'AGENTS.md']
        },
        {
          id: 'docs_governance',
          title: 'Docs governance',
          status: 'partial',
          score: 1,
          maxScore: 2,
          summary: 'Docs audit is enforced, with one known warning still tracked separately.',
          evidence: ['AGENTS.md', 'docs/roadmap/README.md'],
          nextAction: 'Keep the AGENTS planning-language warning scoped to a separate cleanup lane.'
        },
        {
          id: 'local_verification',
          title: 'Local verification',
          status: 'verified',
          score: 2,
          maxScore: 2,
          summary: 'Local verification receipts and evidence flows are already modeled explicitly.',
          evidence: ['docs/contracts/LOCAL_VERIFICATION_RECEIPT_CONTRACT.md', '.playbook/local-verification-receipt.json']
        },
        {
          id: 'owner_truth',
          title: 'Owner truth',
          status: 'verified',
          score: 2,
          maxScore: 2,
          summary: 'Canonical contract and roadmap owner surfaces are published and versioned.',
          evidence: ['docs/contracts/PLAYBOOK-CONTRACT.md', 'docs/roadmap/ROADMAP.json']
        },
        {
          id: 'roadmap_governance',
          title: 'Roadmap governance',
          status: 'verified',
          score: 2,
          maxScore: 2,
          summary: 'Feature sequencing, status semantics, and roadmap validation are governed by contract.',
          evidence: ['docs/roadmap/ROADMAP.json', 'scripts/validate-roadmap-contract.mjs']
        },
        {
          id: 'verification_truth',
          title: 'Verification truth',
          status: 'verified',
          score: 2,
          maxScore: 2,
          summary: 'The repo carries deterministic verification contracts and root validation gates.',
          evidence: ['scripts/validate-roadmap-contract.mjs', 'docs/contracts/COMMAND_CONTRACTS_V1.md']
        },
        {
          id: 'workflow_pack_adoption',
          title: 'Workflow-pack adoption',
          status: 'partial',
          score: 1,
          maxScore: 2,
          summary: 'Workflow-pack doctrine exists, but the environment-bridge contract is still a later slice.',
          evidence: ['docs/contracts/WORKFLOW_PACK_REUSE_CONTRACT.md', 'docs/roadmap/WAVE_ONE_EXTERNAL_RESEARCH_ROADMAP_2026-05-03.md'],
          nextAction: 'Land the workflow-pack environment bridge contract before grading this dimension as verified.'
        }
      ],
      warnings: [],
      blocked: []
    });
  });

  it('returns the same report regardless of input order', () => {
    const first = buildRepoScorecardReport(baseInput());
    const second = buildRepoScorecardReport({
      ...baseInput(),
      dimensions: [...baseInput().dimensions].reverse()
    });

    expect(first).toEqual(second);
  });

  it('fails closed when dimension ids, summary counts, or command claims are invalid', () => {
    const report = buildRepoScorecardReport({
      repo: {
        id: 'Bad ID',
        role: 'unknown'
      },
      summary: {
        verified: 99,
        partial: 0,
        missing: 0,
        notApplicable: 0
      },
      dimensions: [
        {
          id: 'owner_truth',
          title: 'Owner truth',
          status: 'verified',
          summary: 'Owner truth summary.',
          evidence: ['docs/contracts/PLAYBOOK-CONTRACT.md'],
          commandAvailability: 'implemented'
        },
        {
          id: 'owner_truth',
          title: 'Duplicate owner truth',
          status: 'verified',
          summary: 'Duplicate.',
          evidence: ['docs/roadmap/ROADMAP.json']
        }
      ]
    });

    expect(report.status).toBe('blocked');
    expect(report.summary).toEqual({
      score: 0,
      maxScore: 0,
      grade: 'unrated'
    });
    expect(report.dimensions).toHaveLength(0);
    expect(report.blocked).toEqual(expect.arrayContaining([
      {
        code: 'invalid-repo-id',
        field: 'repo.id',
        message: 'Repo id "Bad ID" must use stable kebab-case format.'
      },
      {
        code: 'invalid-repo-role',
        field: 'repo.role',
        message: 'Repo role "unknown" is not supported for scorecard reports.'
      },
      {
        code: 'duplicate-dimension-id',
        dimensionId: 'owner_truth',
        field: 'id',
        message: 'Dimension id "owner_truth" must be unique.'
      },
      {
        code: 'command-availability-claim',
        dimensionId: 'owner_truth',
        field: 'commandAvailability',
        message: 'Dimension "owner_truth" must not claim command availability via "commandAvailability".'
      },
      {
        code: 'summary-mismatch',
        field: 'summary.verified',
        message: 'Scorecard summary.verified must equal the counted dimension status total (0).'
      }
    ]));
    expect(report.blocked.some((issue) => issue.code === 'missing-dimension')).toBe(true);
  });

  it('derives scores and grades deterministically', () => {
    expect(validateRepoScorecardId('fawxzzy-playbook')).toBe(true);
    expect(validateRepoScorecardId('Bad ID')).toBe(false);
    expect(scoreRepoScorecardDimensionStatus('verified')).toEqual({ score: 2, maxScore: 2 });
    expect(scoreRepoScorecardDimensionStatus('partial')).toEqual({ score: 1, maxScore: 2 });
    expect(scoreRepoScorecardDimensionStatus('not_applicable')).toEqual({ score: 0, maxScore: 0 });
    expect(deriveRepoScorecardGrade(0, 0)).toBe('unrated');
    expect(deriveRepoScorecardGrade(15, 16)).toBe('a');
    expect(deriveRepoScorecardGrade(13, 16)).toBe('b');
    expect(deriveRepoScorecardGrade(10, 16)).toBe('c');
    expect(deriveRepoScorecardGrade(7, 16)).toBe('d');
    expect(deriveRepoScorecardGrade(4, 16)).toBe('f');
  });
});
