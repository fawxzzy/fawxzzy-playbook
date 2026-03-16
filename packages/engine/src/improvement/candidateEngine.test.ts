import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateImprovementCandidates } from './candidateEngine.js';

type EventSeed = Record<string, unknown>;

const createRepo = (): string => fs.mkdtempSync(path.join(os.tmpdir(), 'playbook-improvement-engine-'));

const writeLearningState = (repo: string, validationCostPressure = 0.2): void => {
  const learningPath = path.join(repo, '.playbook', 'learning-state.json');
  fs.mkdirSync(path.dirname(learningPath), { recursive: true });
  fs.writeFileSync(
    learningPath,
    JSON.stringify(
      {
        schemaVersion: '1.0',
        kind: 'learning-state-snapshot',
        generatedAt: '2026-01-01T00:00:00.000Z',
        proposalOnly: true,
        sourceArtifacts: {
          outcomeTelemetry: { available: true, recordCount: 1, artifactPath: '.playbook/outcome-telemetry.json' },
          processTelemetry: { available: true, recordCount: 1, artifactPath: '.playbook/process-telemetry.json' },
          taskExecutionProfile: { available: true, recordCount: 1, artifactPath: '.playbook/task-execution-profile.json' }
        },
        metrics: {
          sample_size: 12,
          first_pass_yield: 0.9,
          retry_pressure: { docs_only: 0.1 },
          validation_load_ratio: 0.2,
          route_efficiency_score: { docs_only: 0.9 },
          smallest_sufficient_route_score: 0.9,
          parallel_safety_realized: 0.95,
          router_fit_score: 0.9,
          reasoning_scope_efficiency: 0.9,
          validation_cost_pressure: validationCostPressure,
          pattern_family_effectiveness_score: { docs_only: 0.9 },
          portability_confidence: 0.8
        },
        confidenceSummary: {
          sample_size_score: 0.8,
          coverage_score: 0.8,
          evidence_completeness_score: 0.9,
          overall_confidence: 0.9,
          open_questions: []
        }
      },
      null,
      2
    )
  );
};

const writeEvents = (repo: string, events: EventSeed[]): void => {
  const eventsDir = path.join(repo, '.playbook', 'memory', 'events');
  fs.mkdirSync(eventsDir, { recursive: true });
  events.forEach((event, index) => {
    fs.writeFileSync(path.join(eventsDir, `event-${index}.json`), JSON.stringify(event, null, 2));
  });
};

describe('improvement candidate evidence gating', () => {
  it('promotes AUTO-SAFE with repeated multi-run evidence', () => {
    const repo = createRepo();
    writeLearningState(repo, 0.25);
    writeEvents(
      repo,
      Array.from({ length: 5 }, (_, index) => ({
        schemaVersion: '1.0',
        event_type: 'worker_assignment',
        event_id: `worker-${index}`,
        timestamp: `2026-01-0${index < 3 ? 1 : 2}T00:00:00.000Z`,
        lane_id: `lane-${index}`,
        worker_id: 'planner_worker',
        assignment_status: 'blocked'
      }))
    );

    const artifact = generateImprovementCandidates(repo);
    const autoSafe = artifact.candidates.find((candidate) => candidate.gating_tier === 'AUTO-SAFE');

    expect(autoSafe).toBeDefined();
    expect(autoSafe?.required_review).toBe(false);
    expect(autoSafe?.evidence_count).toBe(5);
    expect(autoSafe?.supporting_runs).toBe(2);
    expect(artifact.rejected_candidates).toHaveLength(0);

    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('creates CONVERSATIONAL proposal for reviewable routing change', () => {
    const repo = createRepo();
    writeLearningState(repo, 0.9);
    writeEvents(
      repo,
      Array.from({ length: 3 }, (_, index) => ({
        schemaVersion: '1.0',
        event_type: 'route_decision',
        event_id: `route-${index}`,
        timestamp: `2026-01-0${index + 1}T00:00:00.000Z`,
        task_text: 'optimize docs path',
        task_family: 'docs_only',
        route_id: 'docs_default',
        confidence: 0.95
      }))
    );

    const artifact = generateImprovementCandidates(repo);
    const conversational = artifact.candidates.find((candidate) => candidate.gating_tier === 'CONVERSATIONAL');

    expect(conversational).toBeDefined();
    expect(conversational?.required_review).toBe(true);
    expect(conversational?.candidate_id).toBe('routing_docs_overvalidation');

    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('creates GOVERNANCE proposal for ontology/doctrine review', () => {
    const repo = createRepo();
    writeLearningState(repo, 0.2);
    writeEvents(
      repo,
      Array.from({ length: 3 }, (_, index) => ({
        schemaVersion: '1.0',
        event_type: 'improvement_candidate',
        event_id: `ontology-${index}`,
        timestamp: `2026-01-0${index + 1}T00:00:00.000Z`,
        candidate_id: `ontology-${index}`,
        source: 'ontology-observer',
        summary: 'Ontology drift in route taxonomy',
        confidence: 0.9
      }))
    );

    const artifact = generateImprovementCandidates(repo);
    const governance = artifact.candidates.find((candidate) => candidate.gating_tier === 'GOVERNANCE');

    expect(governance).toBeDefined();
    expect(governance?.required_review).toBe(true);

    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('rejects candidate with insufficient evidence', () => {
    const repo = createRepo();
    writeLearningState(repo, 0.2);
    writeEvents(repo, [
      {
        schemaVersion: '1.0',
        event_type: 'worker_assignment',
        event_id: 'worker-1',
        timestamp: '2026-01-01T00:00:00.000Z',
        lane_id: 'lane-1',
        worker_id: 'planner_worker',
        assignment_status: 'blocked'
      }
    ]);

    const artifact = generateImprovementCandidates(repo);

    expect(artifact.candidates).toHaveLength(0);
    expect(artifact.rejected_candidates.length).toBeGreaterThan(0);
    expect(artifact.rejected_candidates[0]?.blocking_reasons.some((reason) => reason.includes('insufficient_evidence_count'))).toBe(true);

    fs.rmSync(repo, { recursive: true, force: true });
  });
});
