import { mergeChangelogConfig, validateChangelogConfig } from './config.js';
import type {
  ChangelogEntry,
  ChangelogGeneratorConfig,
  ChangelogValidationDiagnostic
} from './types.js';
import type { ClassifiedChangelogChange } from './types.js';

export type ValidateChangelogGenerationInput = {
  entries?: ChangelogEntry[];
  classifiedChanges?: ClassifiedChangelogChange[];
  configOverrides?: Partial<ChangelogGeneratorConfig>;
  generatedMarkdown?: string;
  baseRef?: string;
  headRef?: string;
};

export type ChangelogValidationSummary = {
  entryCount: number;
  unknownCount: number;
  lowConfidenceCount: number;
  breakingChangeCount: number;
  securityRelatedCount: number;
};

export type ChangelogValidationResult = {
  schemaVersion: '1.0';
  kind: 'playbook-changelog-validation';
  status: 'pass' | 'fail';
  diagnostics: ChangelogValidationDiagnostic[];
  summary: ChangelogValidationSummary;
};

const buildEntrySourceRef = (entry: ChangelogEntry): string | undefined => entry.sourceRefs[0];

const buildClassifiedSourceRef = (change: ClassifiedChangelogChange): string | undefined =>
  change.raw.shortId ?? change.raw.id ?? change.raw.url;

export const validateChangelogGeneration = (
  input: ValidateChangelogGenerationInput = {}
): ChangelogValidationResult => {
  const config = mergeChangelogConfig(input.configOverrides);
  const configDiagnostics = validateChangelogConfig(config);
  const entries = input.entries ?? [];
  const classifiedChanges = input.classifiedChanges ?? [];
  const diagnostics: ChangelogValidationDiagnostic[] = [...configDiagnostics];

  const unknownCount = entries.filter((entry) => entry.category === 'unknown').length;
  const lowConfidenceEntries = entries.filter(
    (entry) => entry.confidence !== undefined && entry.confidence < config.lowConfidenceThreshold
  );
  const lowConfidenceClassified = classifiedChanges.filter((change) => change.confidence < config.lowConfidenceThreshold);
  const lowConfidenceCount = Math.max(lowConfidenceEntries.length, lowConfidenceClassified.length);
  const breakingChangeCount = entries.filter((entry) => entry.breakingChange).length;
  const securityRelatedCount = entries.filter((entry) => entry.securityRelated).length;

  if (input.generatedMarkdown !== undefined && input.generatedMarkdown.trim().length === 0) {
    diagnostics.push({
      id: 'changelog.validation.output.empty',
      severity: 'error',
      message: 'Generated changelog output is empty.',
      evidence: `base=${input.baseRef ?? ''};head=${input.headRef ?? ''}`
    });
  }

  if (config.requireChanges && entries.length === 0) {
    diagnostics.push({
      id: 'changelog.validation.entries.missing',
      severity: 'error',
      message: 'Changelog generation requires at least one entry for the selected range.',
      evidence: `base=${input.baseRef ?? ''};head=${input.headRef ?? ''}`
    });
  }

  if (!config.requireChanges && entries.length === 0) {
    diagnostics.push({
      id: 'changelog.validation.entries.none',
      severity: 'info',
      message: 'No changelog entries were generated for the selected range.',
      evidence: `base=${input.baseRef ?? ''};head=${input.headRef ?? ''}`
    });
  }

  for (const entry of entries) {
    if (entry.category === 'unknown') {
      diagnostics.push({
        id: 'changelog.validation.category.unknown',
        severity: config.failOnUnknown ? 'error' : 'info',
        message: config.failOnUnknown
          ? 'Unknown changelog entry detected while failOnUnknown is enabled.'
          : 'Unknown changelog entry detected.',
        category: entry.category,
        sourceRef: buildEntrySourceRef(entry),
        evidence: entry.what
      });
    }

    if (entry.confidence !== undefined && entry.confidence < config.lowConfidenceThreshold) {
      diagnostics.push({
        id: 'changelog.validation.confidence.low',
        severity: 'warning',
        message: `Changelog entry confidence ${entry.confidence.toFixed(2)} is below the configured threshold ${config.lowConfidenceThreshold.toFixed(2)}.`,
        category: entry.category,
        sourceRef: buildEntrySourceRef(entry),
        evidence: entry.reasons?.join('; ') || entry.what
      });
    }

    if (entry.breakingChange) {
      diagnostics.push({
        id: 'changelog.validation.breaking-change.detected',
        severity: 'warning',
        message: 'Breaking change detected in changelog entries.',
        category: entry.category,
        sourceRef: buildEntrySourceRef(entry),
        evidence: entry.what
      });
    }

    if (entry.securityRelated) {
      diagnostics.push({
        id: 'changelog.validation.security-related.detected',
        severity: 'warning',
        message: 'Security-related change detected in changelog entries.',
        category: entry.category,
        sourceRef: buildEntrySourceRef(entry),
        evidence: entry.what
      });
    }
  }

  for (const change of classifiedChanges) {
    if (change.confidence < config.lowConfidenceThreshold) {
      diagnostics.push({
        id: 'changelog.validation.confidence.low',
        severity: 'warning',
        message: `Classified change confidence ${change.confidence.toFixed(2)} is below the configured threshold ${config.lowConfidenceThreshold.toFixed(2)}.`,
        category: change.category,
        sourceRef: buildClassifiedSourceRef(change),
        evidence: change.reasons.join('; ') || change.raw.title
      });
    }

    if (change.breakingChange) {
      diagnostics.push({
        id: 'changelog.validation.breaking-change.detected',
        severity: 'warning',
        message: 'Breaking change detected in classified changelog input.',
        category: change.category,
        sourceRef: buildClassifiedSourceRef(change),
        evidence: change.raw.title
      });
    }

    if (change.securityRelated) {
      diagnostics.push({
        id: 'changelog.validation.security-related.detected',
        severity: 'warning',
        message: 'Security-related change detected in classified changelog input.',
        category: change.category,
        sourceRef: buildClassifiedSourceRef(change),
        evidence: change.raw.title
      });
    }
  }

  return {
    schemaVersion: '1.0',
    kind: 'playbook-changelog-validation',
    status: diagnostics.some((diagnostic) => diagnostic.severity === 'error') ? 'fail' : 'pass',
    diagnostics,
    summary: {
      entryCount: entries.length,
      unknownCount,
      lowConfidenceCount,
      breakingChangeCount,
      securityRelatedCount
    }
  };
};
