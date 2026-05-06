export const CONVERGENCE_SOURCE_INVENTORY_REPORT_SCHEMA_VERSION = 'playbook.convergence.source-inventory.report.v1' as const;

export const CONVERGENCE_SOURCE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type ConvergenceSourceInventoryInputClassification =
  | 'owner_contract'
  | 'repo_adoption_evidence'
  | 'repo_verification_report'
  | 'root_projection'
  | 'execution_boundary'
  | 'domain_truth'
  | 'external_pack'
  | 'production_observation'
  | 'mission_context'
  | 'architecture_boundary'
  | 'initiative_memory';

export type ConvergenceSourceInventorySourceClass =
  | 'owner_contract'
  | 'repo_adoption_evidence'
  | 'repo_verification_report'
  | 'root_projection'
  | 'external_pack_policy'
  | 'execution_boundary'
  | 'production_observation'
  | 'domain_truth';

export type ConvergenceSourceInventoryInputDecision =
  | 'migrate'
  | 'template'
  | 'reference_only'
  | 'stay_owner_repo'
  | 'future_adapter'
  | 'reject'
  | 'do_not_migrate';

export type ConvergenceSourceInventoryDecision =
  | 'migrate'
  | 'template'
  | 'reference_only'
  | 'future_adapter'
  | 'do_not_migrate';

export type ConvergenceSourceInventoryStatus = 'ok' | 'blocked';

export type ConvergenceSourceInventorySourceRowInput = {
  id: string;
  repo: string;
  path: string;
  classification: ConvergenceSourceInventoryInputClassification;
  migrationDecision: ConvergenceSourceInventoryInputDecision;
  rationale: string;
  targetSurface?: string;
  guardrail?: string;
} & Record<string, unknown>;

export type ConvergenceSourceInventoryIssueCode =
  | 'command-availability-claim'
  | 'duplicate-source-id'
  | 'invalid-source-id'
  | 'missing-field'
  | 'missing-target-surface'
  | 'unknown-classification'
  | 'unknown-migration-decision';

export type ConvergenceSourceInventoryIssue = {
  code: ConvergenceSourceInventoryIssueCode;
  message: string;
  sourceId?: string;
  field?: string;
};

export type ConvergenceSourceInventoryReportRow = {
  id: string;
  repo: string;
  path: string;
  sourceClassification: ConvergenceSourceInventoryInputClassification;
  sourceClass: ConvergenceSourceInventorySourceClass;
  migrationDecision: ConvergenceSourceInventoryDecision;
  rationale: string;
  targetSurface?: string;
  guardrail?: string;
};

export type ConvergenceSourceInventoryReport = {
  schemaVersion: typeof CONVERGENCE_SOURCE_INVENTORY_REPORT_SCHEMA_VERSION;
  status: ConvergenceSourceInventoryStatus;
  summary: {
    totalSources: number;
    byDecision: Partial<Record<ConvergenceSourceInventoryDecision, number>>;
    bySourceClass: Partial<Record<ConvergenceSourceInventorySourceClass, number>>;
  };
  sources: ConvergenceSourceInventoryReportRow[];
  warnings: ConvergenceSourceInventoryIssue[];
  blocked: ConvergenceSourceInventoryIssue[];
};

const REQUIRED_FIELDS = ['id', 'repo', 'path', 'classification', 'migrationDecision', 'rationale'] as const;
const FORBIDDEN_COMMAND_CLAIM_FIELDS = ['command', 'commands', 'commandAvailability', 'commandStatus', 'availability'] as const;

const SOURCE_CLASS_MAP: Record<ConvergenceSourceInventoryInputClassification, ConvergenceSourceInventorySourceClass> = {
  owner_contract: 'owner_contract',
  repo_adoption_evidence: 'repo_adoption_evidence',
  repo_verification_report: 'repo_verification_report',
  root_projection: 'root_projection',
  execution_boundary: 'execution_boundary',
  domain_truth: 'domain_truth',
  external_pack: 'external_pack_policy',
  production_observation: 'production_observation',
  mission_context: 'root_projection',
  architecture_boundary: 'root_projection',
  initiative_memory: 'root_projection'
};

const DECISION_MAP: Record<ConvergenceSourceInventoryInputDecision, ConvergenceSourceInventoryDecision> = {
  migrate: 'migrate',
  template: 'template',
  reference_only: 'reference_only',
  stay_owner_repo: 'do_not_migrate',
  future_adapter: 'future_adapter',
  reject: 'do_not_migrate',
  do_not_migrate: 'do_not_migrate'
};

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

const compareIssues = (left: ConvergenceSourceInventoryIssue, right: ConvergenceSourceInventoryIssue): number =>
  (left.sourceId ?? '').localeCompare(right.sourceId ?? '') ||
  left.code.localeCompare(right.code) ||
  (left.field ?? '').localeCompare(right.field ?? '') ||
  left.message.localeCompare(right.message);

const compareRows = (left: ConvergenceSourceInventoryReportRow, right: ConvergenceSourceInventoryReportRow): number =>
  left.id.localeCompare(right.id) ||
  left.repo.localeCompare(right.repo) ||
  left.path.localeCompare(right.path);

const buildCounts = <T extends string>(values: T[]): Partial<Record<T, number>> => {
  const counts = new Map<T, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Object.fromEntries([...counts.entries()].sort((left, right) => left[0].localeCompare(right[0]))) as Partial<Record<T, number>>;
};

const addIssue = (
  issues: ConvergenceSourceInventoryIssue[],
  issue: ConvergenceSourceInventoryIssue
): void => {
  issues.push(issue);
};

const isKnownClassification = (value: unknown): value is ConvergenceSourceInventoryInputClassification =>
  isNonEmptyString(value) && Object.prototype.hasOwnProperty.call(SOURCE_CLASS_MAP, value);

const isKnownDecision = (value: unknown): value is ConvergenceSourceInventoryInputDecision =>
  isNonEmptyString(value) && Object.prototype.hasOwnProperty.call(DECISION_MAP, value);

export const validateConvergenceSourceId = (id: string): boolean => CONVERGENCE_SOURCE_ID_PATTERN.test(id);

export const normalizeConvergenceSourceClass = (
  classification: ConvergenceSourceInventoryInputClassification
): ConvergenceSourceInventorySourceClass => SOURCE_CLASS_MAP[classification];

export const normalizeConvergenceSourceDecision = (
  decision: ConvergenceSourceInventoryInputDecision
): ConvergenceSourceInventoryDecision => DECISION_MAP[decision];

export const buildConvergenceSourceInventoryReport = (
  rows: ReadonlyArray<Record<string, unknown>>
): ConvergenceSourceInventoryReport => {
  const blocked: ConvergenceSourceInventoryIssue[] = [];
  const warnings: ConvergenceSourceInventoryIssue[] = [];
  const validRows: ConvergenceSourceInventoryReportRow[] = [];
  const idCounts = new Map<string, number>();

  for (const row of rows) {
    if (isNonEmptyString(row.id)) {
      idCounts.set(row.id, (idCounts.get(row.id) ?? 0) + 1);
    }
  }

  rows.forEach((row, index) => {
    const sourceId = isNonEmptyString(row.id) ? row.id : undefined;
    let rowBlocked = false;

    for (const field of REQUIRED_FIELDS) {
      if (!isNonEmptyString(row[field])) {
        addIssue(blocked, {
          code: 'missing-field',
          message: `Source row ${index + 1} is missing required field ${field}.`,
          sourceId,
          field
        });
        rowBlocked = true;
      }
    }

    if (!sourceId) {
      return;
    }

    if (!validateConvergenceSourceId(sourceId)) {
      addIssue(blocked, {
        code: 'invalid-source-id',
        message: `Source ${JSON.stringify(sourceId)} must use stable kebab-case format.`,
        sourceId,
        field: 'id'
      });
      rowBlocked = true;
    }

    if ((idCounts.get(sourceId) ?? 0) > 1) {
      addIssue(blocked, {
        code: 'duplicate-source-id',
        message: `Source id ${JSON.stringify(sourceId)} must be unique.`,
        sourceId,
        field: 'id'
      });
      rowBlocked = true;
    }

    for (const field of FORBIDDEN_COMMAND_CLAIM_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(row, field)) {
        addIssue(blocked, {
          code: 'command-availability-claim',
          message: `Source ${JSON.stringify(sourceId)} must not claim command availability via ${JSON.stringify(field)}.`,
          sourceId,
          field
        });
        rowBlocked = true;
      }
    }

    if (!isKnownClassification(row.classification)) {
      addIssue(blocked, {
        code: 'unknown-classification',
        message: `Source ${JSON.stringify(sourceId)} uses unknown classification ${JSON.stringify(row.classification)}.`,
        sourceId,
        field: 'classification'
      });
      rowBlocked = true;
    }

    if (!isKnownDecision(row.migrationDecision)) {
      addIssue(blocked, {
        code: 'unknown-migration-decision',
        message: `Source ${JSON.stringify(sourceId)} uses unknown migration decision ${JSON.stringify(row.migrationDecision)}.`,
        sourceId,
        field: 'migrationDecision'
      });
      rowBlocked = true;
    }

    if (!isKnownClassification(row.classification) || !isKnownDecision(row.migrationDecision)) {
      return;
    }

    const repo = row.repo;
    const sourcePath = row.path;
    const rationale = row.rationale;

    if (!isNonEmptyString(repo) || !isNonEmptyString(sourcePath) || !isNonEmptyString(rationale)) {
      return;
    }

    const normalizedDecision = normalizeConvergenceSourceDecision(row.migrationDecision);
    if (['migrate', 'template'].includes(normalizedDecision) && !isNonEmptyString(row.targetSurface)) {
      addIssue(blocked, {
        code: 'missing-target-surface',
        message: `Source ${JSON.stringify(sourceId)} requires a proposed Playbook destination for ${JSON.stringify(normalizedDecision)} decisions.`,
        sourceId,
        field: 'targetSurface'
      });
      rowBlocked = true;
    }

    if (rowBlocked) {
      return;
    }

    validRows.push({
      id: sourceId,
      repo,
      path: sourcePath,
      sourceClassification: row.classification,
      sourceClass: normalizeConvergenceSourceClass(row.classification),
      migrationDecision: normalizedDecision,
      rationale,
      targetSurface: isNonEmptyString(row.targetSurface) ? row.targetSurface : undefined,
      guardrail: isNonEmptyString(row.guardrail) ? row.guardrail : undefined
    });
  });

  const sources = [...validRows].sort(compareRows);
  const report: ConvergenceSourceInventoryReport = {
    schemaVersion: CONVERGENCE_SOURCE_INVENTORY_REPORT_SCHEMA_VERSION,
    status: blocked.length > 0 ? 'blocked' : 'ok',
    summary: {
      totalSources: rows.length,
      byDecision: buildCounts(sources.map((row) => row.migrationDecision)),
      bySourceClass: buildCounts(sources.map((row) => row.sourceClass))
    },
    sources,
    warnings: [...warnings].sort(compareIssues),
    blocked: [...blocked].sort(compareIssues)
  };

  return report;
};
