import path from 'node:path';
import { readJsonIfExists, writeDeterministicJsonAtomic } from './io.js';

export const POLICY_IMPROVEMENT_SCHEMA_VERSION = '1.0' as const;
export const POLICY_IMPROVEMENT_RELATIVE_PATH = '.playbook/policy-improvement.json' as const;

const OUTCOME_FEEDBACK_PATH = '.playbook/outcome-feedback.json' as const;
const LEARNING_STATE_PATH = '.playbook/learning-state.json' as const;
const LEARNING_CLUSTERS_PATH = '.playbook/learning-clusters.json' as const;
const GRAPH_INFORMED_LEARNING_PATH = '.playbook/graph-informed-learning.json' as const;
const POLICY_EVALUATION_PATH = '.playbook/policy-evaluation.json' as const;
const REMEDIATION_STATUS_PATH = '.playbook/remediation-status.json' as const;
const REMEDIATION_HISTORY_PATH = '.playbook/test-autofix-history.json' as const;
const PR_REVIEW_PATH = '.playbook/pr-review.json' as const;

const DEFAULT_ISO = new Date(0).toISOString();

export type PolicyImprovementArtifact = {
  schemaVersion: typeof POLICY_IMPROVEMENT_SCHEMA_VERSION;
  kind: 'policy-improvement';
  generatedAt: string;
  reviewOnly: true;
  proposalOnly: true;
  sourceArtifacts: string[];
  authority: {
    mutation: 'read-only';
    promotion: 'review-required';
    ruleMutation: 'forbidden';
  };
  candidateRankingAdjustments: Array<{
    candidateId: string;
    adjustmentDirection: 'promote' | 'demote' | 'hold';
    adjustmentMagnitude: number;
    rationale: string;
    provenanceRefs: string[];
    reviewRequired: true;
  }>;
  prioritizationImprovementSuggestions: Array<{
    suggestionId: string;
    priority: 'high' | 'medium' | 'low';
    summary: string;
    provenanceRefs: string[];
    reviewRequired: true;
  }>;
  repeatedBlockerInfluence: Array<{
    blockerKey: string;
    blockerType: 'policy-decision' | 'failure-signature' | 'review-pressure';
    occurrences: number;
    influenceScore: number;
    recommendation: string;
    provenanceRefs: string[];
    reviewRequired: true;
  }>;
  confidenceTrendNotes: Array<{
    noteId: string;
    trend: 'improving' | 'declining' | 'stable';
    confidenceDelta: number;
    summary: string;
    provenanceRefs: string[];
    reviewRequired: true;
  }>;
  reviewRequiredFlags: {
    requiresHumanReview: true;
    candidateOnly: true;
    noDirectPolicyMutation: true;
    noRuleMutation: true;
    noExecutionSideEffects: true;
  };
  provenanceRefs: string[];
};

type OutcomeFeedbackArtifact = {
  generatedAt?: string;
  outcomes?: Array<{
    outcomeClass?: string;
    sourceRef?: string;
    candidateSignals?: {
      confidenceUpdate?: {
        direction?: 'up' | 'down' | 'flat';
        magnitude?: number;
      };
      trendUpdates?: string[];
    };
    provenanceRefs?: string[];
  }>;
};

type LearningStateArtifact = {
  generatedAt?: string;
  confidenceSummary?: {
    overall_confidence?: number;
  };
};

type LearningClustersArtifact = {
  generatedAt?: string;
  clusters?: Array<{
    clusterId?: string;
    dimension?: string;
    confidence?: number;
    repeatedSignalSummary?: string;
    sourceEvidenceRefs?: string[];
  }>;
};

type GraphInformedLearningArtifact = {
  generatedAt?: string;
  clusters?: Array<{
    clusterId?: string;
    relatedModules?: string[];
    structuralConcentration?: {
      classification?: 'concentrated' | 'balanced' | 'spread';
      governanceCoverageRatio?: number;
    };
  }>;
};

type PolicyEvaluationArtifact = {
  generatedAt?: string;
  evaluations?: Array<{
    proposal_id?: string;
    decision?: 'safe' | 'requires_review' | 'blocked';
    reason?: string;
  }>;
};

type RemediationStatusArtifact = {
  generatedAt?: string;
  blocked_signatures?: string[];
  review_required_signatures?: string[];
  telemetry?: {
    blocked_signature_rollup?: Array<{ failure_signature?: string; blocked_count?: number }>;
    repeat_policy_block_counts?: Array<{ decision?: string; count?: number }>;
  };
};

type RemediationHistoryArtifact = {
  generatedAt?: string;
  runs?: Array<{ final_status?: string }>;
};

type PrReviewArtifact = {
  generatedAt?: string;
  summary?: {
    findings_count?: number;
    requires_review_count?: number;
  };
};

const stableUniqueSorted = (values: Array<string | null | undefined>): string[] =>
  [...new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0))].sort((a, b) => a.localeCompare(b));

const round4 = (value: number): number => Number(value.toFixed(4));
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const toReviewPriority = (score: number): 'high' | 'medium' | 'low' => {
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
};

const readInputs = (repoRoot: string) => ({
  outcomeFeedback: readJsonIfExists<OutcomeFeedbackArtifact>(path.join(repoRoot, OUTCOME_FEEDBACK_PATH)),
  learningState: readJsonIfExists<LearningStateArtifact>(path.join(repoRoot, LEARNING_STATE_PATH)),
  learningClusters: readJsonIfExists<LearningClustersArtifact>(path.join(repoRoot, LEARNING_CLUSTERS_PATH)),
  graphInformedLearning: readJsonIfExists<GraphInformedLearningArtifact>(path.join(repoRoot, GRAPH_INFORMED_LEARNING_PATH)),
  policyEvaluation: readJsonIfExists<PolicyEvaluationArtifact>(path.join(repoRoot, POLICY_EVALUATION_PATH)),
  remediationStatus: readJsonIfExists<RemediationStatusArtifact>(path.join(repoRoot, REMEDIATION_STATUS_PATH)),
  remediationHistory: readJsonIfExists<RemediationHistoryArtifact>(path.join(repoRoot, REMEDIATION_HISTORY_PATH)),
  prReview: readJsonIfExists<PrReviewArtifact>(path.join(repoRoot, PR_REVIEW_PATH))
});

export const buildPolicyImprovementArtifact = (repoRoot: string): PolicyImprovementArtifact => {
  const {
    outcomeFeedback,
    learningState,
    learningClusters,
    graphInformedLearning,
    policyEvaluation,
    remediationStatus,
    remediationHistory,
    prReview
  } = readInputs(repoRoot);

  const sourceArtifacts = stableUniqueSorted([
    outcomeFeedback ? OUTCOME_FEEDBACK_PATH : null,
    learningState ? LEARNING_STATE_PATH : null,
    learningClusters ? LEARNING_CLUSTERS_PATH : null,
    graphInformedLearning ? GRAPH_INFORMED_LEARNING_PATH : null,
    policyEvaluation ? POLICY_EVALUATION_PATH : null,
    remediationStatus ? REMEDIATION_STATUS_PATH : null,
    remediationHistory ? REMEDIATION_HISTORY_PATH : null,
    prReview ? PR_REVIEW_PATH : null
  ]);

  const blockedDecisions = (policyEvaluation?.evaluations ?? []).filter((row) => row.decision === 'blocked');
  const reviewDecisions = (policyEvaluation?.evaluations ?? []).filter((row) => row.decision === 'requires_review');
  const safeDecisions = (policyEvaluation?.evaluations ?? []).filter((row) => row.decision === 'safe');

  const candidateRankingAdjustments: PolicyImprovementArtifact['candidateRankingAdjustments'] = [
    {
      candidateId: 'candidate:policy-evaluation:block-boundary',
      adjustmentDirection: blockedDecisions.length > safeDecisions.length ? ('demote' as const) : ('hold' as const),
      adjustmentMagnitude: round4(clamp01(blockedDecisions.length / Math.max(1, (policyEvaluation?.evaluations ?? []).length))),
      rationale:
        blockedDecisions.length > safeDecisions.length
          ? 'Blocked policy decisions outweigh safe decisions; candidate ranking should demote aggressive automation candidates until reviewed.'
          : 'Policy evidence does not show blocked dominance; keep ranking conservative and review-first.',
      provenanceRefs: stableUniqueSorted([
        policyEvaluation ? `${POLICY_EVALUATION_PATH}#evaluations` : null,
        remediationStatus ? `${REMEDIATION_STATUS_PATH}#telemetry/repeat_policy_block_counts` : null
      ]),
      reviewRequired: true as const
    },
    {
      candidateId: 'candidate:outcome-feedback:confidence-trend',
      adjustmentDirection: (outcomeFeedback?.outcomes ?? []).some((row) => row.candidateSignals?.confidenceUpdate?.direction === 'down')
        ? ('demote' as const)
        : (outcomeFeedback?.outcomes ?? []).some((row) => row.candidateSignals?.confidenceUpdate?.direction === 'up')
          ? ('promote' as const)
          : ('hold' as const),
      adjustmentMagnitude: round4(
        clamp01(
          (outcomeFeedback?.outcomes ?? []).reduce((sum, row) => sum + (row.candidateSignals?.confidenceUpdate?.magnitude ?? 0), 0) /
            Math.max(1, (outcomeFeedback?.outcomes ?? []).length)
        )
      ),
      rationale:
        'Outcome-feedback confidence trends are candidate-only ranking hints and never direct policy mutation.',
      provenanceRefs: stableUniqueSorted([
        outcomeFeedback ? `${OUTCOME_FEEDBACK_PATH}#outcomes` : null,
        learningState ? `${LEARNING_STATE_PATH}#confidenceSummary/overall_confidence` : null
      ]),
      reviewRequired: true as const
    }
  ].sort((a, b) => a.candidateId.localeCompare(b.candidateId));

  const prioritizationImprovementSuggestions = [
    {
      suggestionId: 'priority:repeat-blockers-first',
      priority: toReviewPriority(clamp01((reviewDecisions.length + blockedDecisions.length) / Math.max(1, (policyEvaluation?.evaluations ?? []).length))),
      summary:
        'Prioritize policy-improvement review for repeated blocker signatures and requires_review decisions before any safe-path ranking adjustments.',
      provenanceRefs: stableUniqueSorted([
        remediationStatus ? `${REMEDIATION_STATUS_PATH}#blocked_signatures` : null,
        policyEvaluation ? `${POLICY_EVALUATION_PATH}#evaluations` : null,
        prReview ? `${PR_REVIEW_PATH}#summary/requires_review_count` : null
      ]),
      reviewRequired: true as const
    },
    {
      suggestionId: 'priority:cluster-concentration',
      priority: toReviewPriority(
        clamp01(
          ((learningClusters?.clusters ?? []).length / 10) * 0.5 +
            ((graphInformedLearning?.clusters ?? []).filter((row) => row.structuralConcentration?.classification === 'concentrated').length /
              Math.max(1, (graphInformedLearning?.clusters ?? []).length)) *
              0.5
        )
      ),
      summary:
        'Prioritize clustered repeated-signal dimensions with concentrated graph coverage to improve deterministic candidate ranking with explicit review gates.',
      provenanceRefs: stableUniqueSorted([
        learningClusters ? `${LEARNING_CLUSTERS_PATH}#clusters` : null,
        graphInformedLearning ? `${GRAPH_INFORMED_LEARNING_PATH}#clusters` : null
      ]),
      reviewRequired: true as const
    }
  ].sort((a, b) => a.suggestionId.localeCompare(b.suggestionId));

  const repeatedBlockerInfluence = [
    ...((remediationStatus?.telemetry?.blocked_signature_rollup ?? [])
      .filter((row) => typeof row.failure_signature === 'string' && typeof row.blocked_count === 'number' && row.blocked_count > 0)
      .map((row) => ({
        blockerKey: row.failure_signature as string,
        blockerType: 'failure-signature' as const,
        occurrences: row.blocked_count as number,
        influenceScore: round4(clamp01((row.blocked_count as number) / 5)),
        recommendation: `Keep ${row.failure_signature as string} in review-required lane until repeated blocker pressure subsides.`,
        provenanceRefs: [`${REMEDIATION_STATUS_PATH}#telemetry/blocked_signature_rollup/${row.failure_signature as string}`],
        reviewRequired: true as const
      }))),
    ...((remediationStatus?.telemetry?.repeat_policy_block_counts ?? [])
      .filter((row) => typeof row.decision === 'string' && typeof row.count === 'number' && row.count > 0)
      .map((row) => ({
        blockerKey: row.decision as string,
        blockerType: 'policy-decision' as const,
        occurrences: row.count as number,
        influenceScore: round4(clamp01((row.count as number) / 5)),
        recommendation: `Treat repeat policy decision "${row.decision as string}" as advisory prioritization input only; retain explicit review boundaries.`,
        provenanceRefs: [`${REMEDIATION_STATUS_PATH}#telemetry/repeat_policy_block_counts/${row.decision as string}`],
        reviewRequired: true as const
      }))),
    ...(typeof prReview?.summary?.requires_review_count === 'number' && prReview.summary.requires_review_count > 0
      ? [
          {
            blockerKey: 'pr-review-requires-review-pressure',
            blockerType: 'review-pressure' as const,
            occurrences: prReview.summary.requires_review_count,
            influenceScore: round4(clamp01(prReview.summary.requires_review_count / Math.max(1, prReview.summary.findings_count ?? 1))),
            recommendation: 'Use PR review pressure as prioritization input for human review queue ordering; do not mutate policy automatically.',
            provenanceRefs: [`${PR_REVIEW_PATH}#summary`],
            reviewRequired: true as const
          }
        ]
      : [])
  ].sort((a, b) => b.occurrences - a.occurrences || a.blockerKey.localeCompare(b.blockerKey));

  const remediationRuns = remediationHistory?.runs ?? [];
  const successfulRuns = remediationRuns.filter((row) => row.final_status === 'fixed' || row.final_status === 'partially_fixed').length;
  const unsuccessfulRuns = remediationRuns.filter((row) => row.final_status && row.final_status !== 'fixed' && row.final_status !== 'partially_fixed').length;

  const confidenceTrendNotes: PolicyImprovementArtifact['confidenceTrendNotes'] = [
    {
      noteId: 'trend:outcome-feedback-confidence',
      trend: (outcomeFeedback?.outcomes ?? []).some((row) => row.candidateSignals?.confidenceUpdate?.direction === 'down')
        ? ('declining' as const)
        : (outcomeFeedback?.outcomes ?? []).some((row) => row.candidateSignals?.confidenceUpdate?.direction === 'up')
          ? ('improving' as const)
          : ('stable' as const),
      confidenceDelta: round4(
        (outcomeFeedback?.outcomes ?? []).reduce((sum, row) => {
          const direction = row.candidateSignals?.confidenceUpdate?.direction;
          const magnitude = row.candidateSignals?.confidenceUpdate?.magnitude ?? 0;
          if (direction === 'down') return sum - magnitude;
          if (direction === 'up') return sum + magnitude;
          return sum;
        }, 0)
      ),
      summary: 'Outcome-feedback confidence updates are advisory trend notes for ranking/prioritization improvements only.',
      provenanceRefs: stableUniqueSorted([
        outcomeFeedback ? `${OUTCOME_FEEDBACK_PATH}#outcomes` : null,
        learningState ? `${LEARNING_STATE_PATH}#confidenceSummary/overall_confidence` : null
      ]),
      reviewRequired: true as const
    },
    {
      noteId: 'trend:remediation-history-outcomes',
      trend: successfulRuns > unsuccessfulRuns ? ('improving' as const) : successfulRuns < unsuccessfulRuns ? ('declining' as const) : ('stable' as const),
      confidenceDelta: round4(clamp01((successfulRuns - unsuccessfulRuns) / Math.max(1, remediationRuns.length))),
      summary: 'Remediation-history run outcomes inform policy improvement prioritization without changing mutation authority.',
      provenanceRefs: stableUniqueSorted([
        remediationHistory ? `${REMEDIATION_HISTORY_PATH}#runs` : null,
        remediationStatus ? `${REMEDIATION_STATUS_PATH}#latest_run` : null
      ]),
      reviewRequired: true as const
    }
  ].sort((a, b) => a.noteId.localeCompare(b.noteId));

  const provenanceRefs = stableUniqueSorted([
    ...candidateRankingAdjustments.flatMap((row) => row.provenanceRefs),
    ...prioritizationImprovementSuggestions.flatMap((row) => row.provenanceRefs),
    ...repeatedBlockerInfluence.flatMap((row) => row.provenanceRefs),
    ...confidenceTrendNotes.flatMap((row) => row.provenanceRefs)
  ]);

  const generatedAt = stableUniqueSorted([
    outcomeFeedback?.generatedAt,
    learningState?.generatedAt,
    learningClusters?.generatedAt,
    graphInformedLearning?.generatedAt,
    policyEvaluation?.generatedAt,
    remediationStatus?.generatedAt,
    remediationHistory?.generatedAt,
    prReview?.generatedAt
  ]).slice(-1)[0] ?? DEFAULT_ISO;

  return {
    schemaVersion: POLICY_IMPROVEMENT_SCHEMA_VERSION,
    kind: 'policy-improvement',
    generatedAt,
    reviewOnly: true,
    proposalOnly: true,
    sourceArtifacts,
    authority: {
      mutation: 'read-only',
      promotion: 'review-required',
      ruleMutation: 'forbidden'
    },
    candidateRankingAdjustments,
    prioritizationImprovementSuggestions,
    repeatedBlockerInfluence,
    confidenceTrendNotes,
    reviewRequiredFlags: {
      requiresHumanReview: true,
      candidateOnly: true,
      noDirectPolicyMutation: true,
      noRuleMutation: true,
      noExecutionSideEffects: true
    },
    provenanceRefs
  };
};

export const writePolicyImprovementArtifact = (
  repoRoot: string,
  artifact: PolicyImprovementArtifact,
  artifactPath = POLICY_IMPROVEMENT_RELATIVE_PATH
): string => {
  const resolvedPath = path.resolve(repoRoot, artifactPath);
  writeDeterministicJsonAtomic(resolvedPath, artifact);
  return resolvedPath;
};

export const buildAndWritePolicyImprovementArtifact = (
  repoRoot: string
): { artifact: PolicyImprovementArtifact; artifactPath: string } => {
  const artifact = buildPolicyImprovementArtifact(repoRoot);
  const artifactPath = writePolicyImprovementArtifact(repoRoot, artifact);
  return { artifact, artifactPath };
};
