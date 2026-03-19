import type { PortabilityOutcomeTelemetryRecord } from '@zachariahredfield/playbook-core';

export const LIFECYCLE_CANDIDATES_RELATIVE_PATH = '.playbook/memory/lifecycle-candidates.json' as const;

export type LifecycleRecommendationAction = 'freshness_review' | 'demote' | 'supersede' | 'retire';
export type LifecycleEvidenceKind = 'execution-receipt' | 'execution-updated-state' | 'execution-outcome-input' | 'promotion-receipt' | 'portability-outcome';

export type LifecycleEvidenceRef = {
  evidence_id: string;
  kind: LifecycleEvidenceKind;
  source_path: string;
  source_ref: string;
  observed_at: string;
  summary: string;
  target_pattern_ids: string[];
  payload_fingerprint: string;
};

export type LifecycleCandidateRecord = {
  recommendation_id: string;
  target_pattern_id: string;
  recommended_action: LifecycleRecommendationAction;
  confidence: number;
  explainability: string[];
  source_evidence: LifecycleEvidenceRef[];
  source_evidence_ids: string[];
  provenance_fingerprints: string[];
  derived_from: Array<'receipts' | 'drift-signals' | 'rollback-events' | 'later-outcomes' | 'promotion-history'>;
  status: 'candidate';
  created_at: string;
  freshness: {
    latest_observed_at: string;
    stale_after_days: number;
  };
};

export type LifecycleCandidatesArtifact = {
  schemaVersion: '1.0';
  kind: 'pattern-lifecycle-candidates';
  generatedAt: string;
  evidence: LifecycleEvidenceRef[];
  candidates: LifecycleCandidateRecord[];
};

export type PortabilityOutcomesArtifactLike = {
  outcomes: PortabilityOutcomeTelemetryRecord[];
};
