import { describe, expect, it } from 'vitest';
import {
  buildConvergenceSourceInventoryReport,
  normalizeConvergenceSourceClass,
  normalizeConvergenceSourceDecision,
  validateConvergenceSourceId,
  type ConvergenceSourceInventorySourceRowInput
} from '../src/convergence/index.js';

const baseRows = (): ConvergenceSourceInventorySourceRowInput[] => [
  {
    id: 'atlas-playbook-ingest',
    repo: 'fawxzzy/ATLAS',
    path: 'docs/architecture/PLAYBOOK-INGEST-PIPELINE.md',
    classification: 'external_pack',
    migrationDecision: 'migrate',
    rationale: 'Import/evaluate/normalize/catalog flow belongs in Playbook pack tooling.',
    targetSurface: 'pack command docs + contracts',
    guardrail: 'No active repo mutation during intake.'
  },
  {
    id: 'atlas-adoption-matrix',
    repo: 'fawxzzy/ATLAS',
    path: 'docs/ops/PLAYBOOK-ADOPTION-MATRIX.md',
    classification: 'root_projection',
    migrationDecision: 'template',
    rationale: 'Status/evidence vocabulary should become reusable scan/report logic.',
    targetSurface: 'convergence scan/report contract',
    guardrail: 'Atlas keeps root projection truth.'
  },
  {
    id: 'playbook-contract',
    repo: 'fawxzzy/fawxzzy-playbook',
    path: 'docs/contracts/PLAYBOOK-CONTRACT.md',
    classification: 'owner_contract',
    migrationDecision: 'migrate',
    rationale: 'Already Playbook owner truth and should remain canonical.',
    targetSurface: 'docs/contracts + exports',
    guardrail: 'Keep schema/version validation green.'
  },
  {
    id: 'lifeline-playbook-export-loader',
    repo: 'fawxzzy/fawxzzy-lifeline',
    path: 'src/core/load-playbook-exports.ts',
    classification: 'execution_boundary',
    migrationDecision: 'reference_only',
    rationale: 'Concrete consumer of Playbook export family/schema version.',
    targetSurface: 'export compatibility tests',
    guardrail: 'Do not move Lifeline execution into Playbook.'
  },
  {
    id: 'supabase-fawxzzyfitness',
    repo: 'Supabase/FawxzzyFitness',
    path: 'public schema metadata',
    classification: 'production_observation',
    migrationDecision: 'future_adapter',
    rationale: 'Production-adjacent evidence can inform future structural observation adapter.',
    targetSurface: 'production observation schema',
    guardrail: 'No secrets or row data; evidence-only.'
  },
  {
    id: 'atlas-initiative-memory',
    repo: 'fawxzzy/ATLAS',
    path: 'docs/memory/initiatives/initiative-playbook-convergence-and-continuity.json',
    classification: 'initiative_memory',
    migrationDecision: 'stay_owner_repo',
    rationale: 'Root portfolio memory should remain in Atlas.',
    guardrail: 'Playbook can reference but must not own initiative truth.'
  }
];

describe('convergence source inventory report', () => {
  it('builds a deterministic normalized report from explicit source rows', () => {
    const report = buildConvergenceSourceInventoryReport([
      baseRows()[4],
      baseRows()[0],
      baseRows()[5],
      baseRows()[2],
      baseRows()[1],
      baseRows()[3]
    ]);

    expect(report).toEqual({
      schemaVersion: 'playbook.convergence.source-inventory.report.v1',
      status: 'ok',
      summary: {
        totalSources: 6,
        byDecision: {
          do_not_migrate: 1,
          future_adapter: 1,
          migrate: 2,
          reference_only: 1,
          template: 1
        },
        bySourceClass: {
          execution_boundary: 1,
          external_pack_policy: 1,
          owner_contract: 1,
          production_observation: 1,
          root_projection: 2
        }
      },
      sources: [
        {
          id: 'atlas-adoption-matrix',
          repo: 'fawxzzy/ATLAS',
          path: 'docs/ops/PLAYBOOK-ADOPTION-MATRIX.md',
          sourceClassification: 'root_projection',
          sourceClass: 'root_projection',
          migrationDecision: 'template',
          rationale: 'Status/evidence vocabulary should become reusable scan/report logic.',
          targetSurface: 'convergence scan/report contract',
          guardrail: 'Atlas keeps root projection truth.'
        },
        {
          id: 'atlas-initiative-memory',
          repo: 'fawxzzy/ATLAS',
          path: 'docs/memory/initiatives/initiative-playbook-convergence-and-continuity.json',
          sourceClassification: 'initiative_memory',
          sourceClass: 'root_projection',
          migrationDecision: 'do_not_migrate',
          rationale: 'Root portfolio memory should remain in Atlas.',
          guardrail: 'Playbook can reference but must not own initiative truth.'
        },
        {
          id: 'atlas-playbook-ingest',
          repo: 'fawxzzy/ATLAS',
          path: 'docs/architecture/PLAYBOOK-INGEST-PIPELINE.md',
          sourceClassification: 'external_pack',
          sourceClass: 'external_pack_policy',
          migrationDecision: 'migrate',
          rationale: 'Import/evaluate/normalize/catalog flow belongs in Playbook pack tooling.',
          targetSurface: 'pack command docs + contracts',
          guardrail: 'No active repo mutation during intake.'
        },
        {
          id: 'lifeline-playbook-export-loader',
          repo: 'fawxzzy/fawxzzy-lifeline',
          path: 'src/core/load-playbook-exports.ts',
          sourceClassification: 'execution_boundary',
          sourceClass: 'execution_boundary',
          migrationDecision: 'reference_only',
          rationale: 'Concrete consumer of Playbook export family/schema version.',
          targetSurface: 'export compatibility tests',
          guardrail: 'Do not move Lifeline execution into Playbook.'
        },
        {
          id: 'playbook-contract',
          repo: 'fawxzzy/fawxzzy-playbook',
          path: 'docs/contracts/PLAYBOOK-CONTRACT.md',
          sourceClassification: 'owner_contract',
          sourceClass: 'owner_contract',
          migrationDecision: 'migrate',
          rationale: 'Already Playbook owner truth and should remain canonical.',
          targetSurface: 'docs/contracts + exports',
          guardrail: 'Keep schema/version validation green.'
        },
        {
          id: 'supabase-fawxzzyfitness',
          repo: 'Supabase/FawxzzyFitness',
          path: 'public schema metadata',
          sourceClassification: 'production_observation',
          sourceClass: 'production_observation',
          migrationDecision: 'future_adapter',
          rationale: 'Production-adjacent evidence can inform future structural observation adapter.',
          targetSurface: 'production observation schema',
          guardrail: 'No secrets or row data; evidence-only.'
        }
      ],
      warnings: [],
      blocked: []
    });
  });

  it('returns the same report regardless of input order', () => {
    const first = buildConvergenceSourceInventoryReport(baseRows());
    const second = buildConvergenceSourceInventoryReport([...baseRows()].reverse());

    expect(first).toEqual(second);
  });

  it('fails closed when ids or destinations are invalid and when command availability is claimed', () => {
    const report = buildConvergenceSourceInventoryReport([
      {
        id: 'Bad ID',
        repo: 'fawxzzy/ATLAS',
        path: 'docs/ops/ATLAS-MISSION-CONTEXT.md',
        classification: 'mission_context',
        migrationDecision: 'reference_only',
        rationale: 'Mission context is stack-owned strategy.'
      },
      {
        id: 'atlas-playbook-ingest',
        repo: 'fawxzzy/ATLAS',
        path: 'docs/architecture/PLAYBOOK-INGEST-PIPELINE.md',
        classification: 'external_pack',
        migrationDecision: 'migrate',
        rationale: 'Needs a destination.',
        targetSurface: ''
      },
      {
        id: 'atlas-playbook-ingest',
        repo: 'fawxzzy/ATLAS',
        path: 'docs/architecture/PLAYBOOK-INGEST-PIPELINE.md',
        classification: 'external_pack',
        migrationDecision: 'migrate',
        rationale: 'Duplicate with command claim.',
        targetSurface: 'pack command docs + contracts',
        commandAvailability: 'implemented'
      }
    ]);

    expect(report.status).toBe('blocked');
    expect(report.summary.totalSources).toBe(3);
    expect(report.sources).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.blocked).toHaveLength(5);
    expect(report.blocked).toEqual(expect.arrayContaining([
      {
        code: 'duplicate-source-id',
        field: 'id',
        message: 'Source id "atlas-playbook-ingest" must be unique.',
        sourceId: 'atlas-playbook-ingest'
      },
      {
        code: 'missing-target-surface',
        field: 'targetSurface',
        message: 'Source "atlas-playbook-ingest" requires a proposed Playbook destination for "migrate" decisions.',
        sourceId: 'atlas-playbook-ingest'
      },
      {
        code: 'command-availability-claim',
        field: 'commandAvailability',
        message: 'Source "atlas-playbook-ingest" must not claim command availability via "commandAvailability".',
        sourceId: 'atlas-playbook-ingest'
      },
      {
        code: 'invalid-source-id',
        field: 'id',
        message: 'Source "Bad ID" must use stable kebab-case format.',
        sourceId: 'Bad ID'
      }
    ]));
    expect(report.blocked.filter((issue) => issue.code === 'duplicate-source-id')).toHaveLength(2);
  });

  it('normalizes classification and decision helpers without widening command claims', () => {
    expect(validateConvergenceSourceId('atlas-playbook-ingest')).toBe(true);
    expect(validateConvergenceSourceId('Bad ID')).toBe(false);
    expect(normalizeConvergenceSourceClass('external_pack')).toBe('external_pack_policy');
    expect(normalizeConvergenceSourceClass('initiative_memory')).toBe('root_projection');
    expect(normalizeConvergenceSourceDecision('stay_owner_repo')).toBe('do_not_migrate');
    expect(normalizeConvergenceSourceDecision('reject')).toBe('do_not_migrate');
  });
});
