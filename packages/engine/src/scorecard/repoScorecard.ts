export const REPO_SCORECARD_REPORT_SCHEMA_VERSION = 'playbook.repo-scorecard.report.v1' as const;

export const REPO_SCORECARD_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type RepoScorecardRole = 'governance_owner' | 'governed_consumer' | 'bounded_executor';
export type RepoScorecardStatus = 'verified' | 'partial' | 'missing' | 'not_applicable';
export type RepoScorecardReportStatus = 'ok' | 'blocked';
export type RepoScorecardGrade = 'a' | 'b' | 'c' | 'd' | 'f' | 'unrated';

export type RepoScorecardDimensionId =
  | 'owner_truth'
  | 'command_truth'
  | 'verification_truth'
  | 'artifact_hygiene'
  | 'docs_governance'
  | 'workflow_pack_adoption'
  | 'local_verification'
  | 'roadmap_governance';

export type RepoScorecardIssueCode =
  | 'command-availability-claim'
  | 'duplicate-dimension-id'
  | 'invalid-dimension-id'
  | 'invalid-repo-id'
  | 'invalid-repo-role'
  | 'missing-dimension'
  | 'missing-field'
  | 'summary-mismatch';

export type RepoScorecardIssue = {
  code: RepoScorecardIssueCode;
  message: string;
  dimensionId?: string;
  field?: string;
};

export type RepoScorecardDimensionInput = {
  id: RepoScorecardDimensionId | string;
  title: string;
  status: RepoScorecardStatus | string;
  summary: string;
  evidence: string[];
  nextAction?: string;
} & Record<string, unknown>;

export type RepoScorecardInput = {
  repo: {
    id: string;
    role: RepoScorecardRole | string;
  } & Record<string, unknown>;
  summary?: {
    verified?: number;
    partial?: number;
    missing?: number;
    notApplicable?: number;
  } & Record<string, unknown>;
  dimensions: RepoScorecardDimensionInput[];
} & Record<string, unknown>;

export type RepoScorecardDimensionReportRow = {
  id: RepoScorecardDimensionId;
  title: string;
  status: RepoScorecardStatus;
  score: number;
  maxScore: number;
  summary: string;
  evidence: string[];
  nextAction?: string;
};

export type RepoScorecardReport = {
  schemaVersion: typeof REPO_SCORECARD_REPORT_SCHEMA_VERSION;
  status: RepoScorecardReportStatus;
  repo: {
    id: string;
    role: RepoScorecardRole;
  };
  summary: {
    score: number;
    maxScore: number;
    grade: RepoScorecardGrade;
  };
  dimensions: RepoScorecardDimensionReportRow[];
  warnings: RepoScorecardIssue[];
  blocked: RepoScorecardIssue[];
};

const REQUIRED_DIMENSION_IDS: RepoScorecardDimensionId[] = [
  'owner_truth',
  'command_truth',
  'verification_truth',
  'artifact_hygiene',
  'docs_governance',
  'workflow_pack_adoption',
  'local_verification',
  'roadmap_governance'
];

const REQUIRED_SUMMARY_KEYS = ['verified', 'partial', 'missing', 'notApplicable'] as const;
const FORBIDDEN_COMMAND_CLAIM_FIELDS = ['command', 'commands', 'commandAvailability', 'commandStatus', 'availability'] as const;
const STATUS_SCORE: Record<RepoScorecardStatus, { score: number; maxScore: number }> = {
  verified: { score: 2, maxScore: 2 },
  partial: { score: 1, maxScore: 2 },
  missing: { score: 0, maxScore: 2 },
  not_applicable: { score: 0, maxScore: 0 }
};

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isFiniteInteger = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;

const compareIssues = (left: RepoScorecardIssue, right: RepoScorecardIssue): number =>
  (left.dimensionId ?? '').localeCompare(right.dimensionId ?? '') ||
  left.code.localeCompare(right.code) ||
  (left.field ?? '').localeCompare(right.field ?? '') ||
  left.message.localeCompare(right.message);

const compareDimensionRows = (left: RepoScorecardDimensionReportRow, right: RepoScorecardDimensionReportRow): number =>
  left.id.localeCompare(right.id) || left.title.localeCompare(right.title);

const addIssue = (issues: RepoScorecardIssue[], issue: RepoScorecardIssue): void => {
  issues.push(issue);
};

const isKnownRole = (value: unknown): value is RepoScorecardRole =>
  value === 'governance_owner' || value === 'governed_consumer' || value === 'bounded_executor';

const isKnownDimensionId = (value: unknown): value is RepoScorecardDimensionId =>
  isNonEmptyString(value) && REQUIRED_DIMENSION_IDS.includes(value as RepoScorecardDimensionId);

const isKnownStatus = (value: unknown): value is RepoScorecardStatus =>
  value === 'verified' || value === 'partial' || value === 'missing' || value === 'not_applicable';

export const validateRepoScorecardId = (id: string): boolean => REPO_SCORECARD_ID_PATTERN.test(id);

export const scoreRepoScorecardDimensionStatus = (status: RepoScorecardStatus): { score: number; maxScore: number } => STATUS_SCORE[status];

export const deriveRepoScorecardGrade = (score: number, maxScore: number): RepoScorecardGrade => {
  if (maxScore === 0) {
    return 'unrated';
  }

  const ratio = score / maxScore;
  if (ratio >= 0.9) return 'a';
  if (ratio >= 0.75) return 'b';
  if (ratio >= 0.6) return 'c';
  if (ratio >= 0.4) return 'd';
  return 'f';
};

export const buildRepoScorecardReport = (input: RepoScorecardInput): RepoScorecardReport => {
  const blocked: RepoScorecardIssue[] = [];
  const warnings: RepoScorecardIssue[] = [];
  const validRows: RepoScorecardDimensionReportRow[] = [];
  const seenDimensionIds = new Map<string, number>();

  for (const row of input.dimensions ?? []) {
    if (isNonEmptyString(row.id)) {
      seenDimensionIds.set(row.id, (seenDimensionIds.get(row.id) ?? 0) + 1);
    }
  }

  const repoId = input.repo?.id;
  const repoRole = input.repo?.role;

  if (!isNonEmptyString(repoId)) {
    addIssue(blocked, {
      code: 'missing-field',
      field: 'repo.id',
      message: 'Repo scorecard input is missing repo.id.'
    });
  } else if (!validateRepoScorecardId(repoId)) {
    addIssue(blocked, {
      code: 'invalid-repo-id',
      field: 'repo.id',
      message: `Repo id ${JSON.stringify(repoId)} must use stable kebab-case format.`
    });
  }

  if (!isKnownRole(repoRole)) {
    addIssue(blocked, {
      code: 'invalid-repo-role',
      field: 'repo.role',
      message: `Repo role ${JSON.stringify(repoRole)} is not supported for scorecard reports.`
    });
  }

  for (const row of input.dimensions ?? []) {
    const dimensionId = isNonEmptyString(row.id) ? row.id : undefined;
    let rowBlocked = false;

    for (const field of ['id', 'title', 'status', 'summary'] as const) {
      if (!isNonEmptyString(row[field])) {
        addIssue(blocked, {
          code: 'missing-field',
          message: `Dimension ${JSON.stringify(dimensionId ?? 'unknown')} is missing required field ${field}.`,
          dimensionId,
          field
        });
        rowBlocked = true;
      }
    }

    if (!dimensionId) {
      continue;
    }

    if (!isKnownDimensionId(dimensionId)) {
      addIssue(blocked, {
        code: 'invalid-dimension-id',
        message: `Dimension id ${JSON.stringify(dimensionId)} is not part of the published scorecard contract.`,
        dimensionId,
        field: 'id'
      });
      rowBlocked = true;
    }

    if ((seenDimensionIds.get(dimensionId) ?? 0) > 1) {
      addIssue(blocked, {
        code: 'duplicate-dimension-id',
        message: `Dimension id ${JSON.stringify(dimensionId)} must be unique.`,
        dimensionId,
        field: 'id'
      });
      rowBlocked = true;
    }

    for (const field of FORBIDDEN_COMMAND_CLAIM_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(row, field)) {
        addIssue(blocked, {
          code: 'command-availability-claim',
          message: `Dimension ${JSON.stringify(dimensionId)} must not claim command availability via ${JSON.stringify(field)}.`,
          dimensionId,
          field
        });
        rowBlocked = true;
      }
    }

    if (!isKnownStatus(row.status)) {
      addIssue(blocked, {
        code: 'missing-field',
        message: `Dimension ${JSON.stringify(dimensionId)} uses unsupported status ${JSON.stringify(row.status)}.`,
        dimensionId,
        field: 'status'
      });
      rowBlocked = true;
    }

    if (!Array.isArray(row.evidence) || row.evidence.length === 0 || row.evidence.some((entry) => !isNonEmptyString(entry))) {
      addIssue(blocked, {
        code: 'missing-field',
        message: `Dimension ${JSON.stringify(dimensionId)} must include one or more evidence references.`,
        dimensionId,
        field: 'evidence'
      });
      rowBlocked = true;
    }

    if (rowBlocked || !isKnownDimensionId(dimensionId) || !isKnownStatus(row.status)) {
      continue;
    }

    const { score, maxScore } = scoreRepoScorecardDimensionStatus(row.status);
    validRows.push({
      id: dimensionId,
      title: row.title,
      status: row.status,
      score,
      maxScore,
      summary: row.summary,
      evidence: [...row.evidence],
      nextAction: isNonEmptyString(row.nextAction) ? row.nextAction : undefined
    });
  }

  for (const requiredDimensionId of REQUIRED_DIMENSION_IDS) {
    if (!validRows.some((row) => row.id === requiredDimensionId)) {
      addIssue(blocked, {
        code: 'missing-dimension',
        message: `Scorecard input is missing required dimension ${JSON.stringify(requiredDimensionId)}.`,
        dimensionId: requiredDimensionId,
        field: 'dimensions'
      });
    }
  }

  const countedSummary = {
    verified: validRows.filter((row) => row.status === 'verified').length,
    partial: validRows.filter((row) => row.status === 'partial').length,
    missing: validRows.filter((row) => row.status === 'missing').length,
    notApplicable: validRows.filter((row) => row.status === 'not_applicable').length
  };

  if (input.summary) {
    for (const key of REQUIRED_SUMMARY_KEYS) {
      if (!isFiniteInteger(input.summary[key])) {
        addIssue(blocked, {
          code: 'summary-mismatch',
          message: `Scorecard summary.${key} must be a non-negative integer.`,
          field: `summary.${key}`
        });
        continue;
      }

      if (input.summary[key] !== countedSummary[key]) {
        addIssue(blocked, {
          code: 'summary-mismatch',
          message: `Scorecard summary.${key} must equal the counted dimension status total (${countedSummary[key]}).`,
          field: `summary.${key}`
        });
      }
    }
  }

  const dimensions = [...validRows].sort(compareDimensionRows);
  const score = dimensions.reduce((sum, row) => sum + row.score, 0);
  const maxScore = dimensions.reduce((sum, row) => sum + row.maxScore, 0);

  return {
    schemaVersion: REPO_SCORECARD_REPORT_SCHEMA_VERSION,
    status: blocked.length > 0 ? 'blocked' : 'ok',
    repo: {
      id: isNonEmptyString(repoId) ? repoId : 'invalid-repo',
      role: isKnownRole(repoRole) ? repoRole : 'governed_consumer'
    },
    summary: {
      score,
      maxScore,
      grade: deriveRepoScorecardGrade(score, maxScore)
    },
    dimensions,
    warnings: [...warnings].sort(compareIssues),
    blocked: [...blocked].sort(compareIssues)
  };
};
