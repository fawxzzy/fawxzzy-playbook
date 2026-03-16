import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLAYBOOK_SCHEMA_PATHS } from '../../packages/contracts/src/index.js';

type CycleHistoryLike = {
  history_version?: unknown;
  repo?: unknown;
  cycles?: unknown;
};

const validateCycleHistoryLike = (artifact: CycleHistoryLike): boolean => {
  const required = ['history_version', 'repo', 'cycles'] as const;
  for (const key of required) {
    if (!(key in artifact)) {
      return false;
    }
  }

  if (typeof artifact.history_version !== 'number') return false;
  if (typeof artifact.repo !== 'string') return false;
  if (!Array.isArray(artifact.cycles)) return false;

  for (const cycle of artifact.cycles) {
    if (typeof cycle !== 'object' || cycle === null) return false;
    const cycleRecord = cycle as Record<string, unknown>;
    if (typeof cycleRecord.cycle_id !== 'string') return false;
    if (typeof cycleRecord.started_at !== 'string') return false;
    if (cycleRecord.result !== 'success' && cycleRecord.result !== 'failed') return false;
    if (typeof cycleRecord.duration_ms !== 'number') return false;
    if (cycleRecord.result === 'success' && cycleRecord.failed_step !== undefined) return false;
    if (cycleRecord.result === 'failed' && typeof cycleRecord.failed_step !== 'string') return false;
  }

  return true;
};

describe('cycle-history contract', () => {
  it('registers cycle-history schema path', () => {
    expect(PLAYBOOK_SCHEMA_PATHS.cycleHistory).toBe('packages/contracts/src/cycle-history.schema.json');
  });

  it('declares cycle-history result/failed_step guardrails', () => {
    const schemaPath = path.resolve(process.cwd(), PLAYBOOK_SCHEMA_PATHS.cycleHistory);
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as {
      properties?: { cycles?: { items?: { properties?: { result?: { enum?: string[] } }; allOf?: Array<{ then?: { required?: string[]; not?: { required?: string[] } } }> } } };
    };

    expect(schema.properties?.cycles?.items?.properties?.result?.enum).toEqual(['success', 'failed']);
    expect(schema.properties?.cycles?.items?.allOf?.[0]?.then?.not?.required).toEqual(['failed_step']);
    expect(schema.properties?.cycles?.items?.allOf?.[1]?.then?.required).toEqual(['failed_step']);
  });

  it('rejects malformed cycle-history payloads', () => {
    const malformedSuccess: CycleHistoryLike = {
      history_version: 1,
      repo: '/repo',
      cycles: [
        {
          cycle_id: 'cycle-1',
          started_at: new Date().toISOString(),
          result: 'success',
          failed_step: 'verify',
          duration_ms: 10
        }
      ]
    };

    const malformedFailed: CycleHistoryLike = {
      history_version: 1,
      repo: '/repo',
      cycles: [
        {
          cycle_id: 'cycle-2',
          started_at: new Date().toISOString(),
          result: 'failed',
          duration_ms: 10
        }
      ]
    };

    expect(validateCycleHistoryLike(malformedSuccess)).toBe(false);
    expect(validateCycleHistoryLike(malformedFailed)).toBe(false);
  });
});
