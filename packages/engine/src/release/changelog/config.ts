import type {
  ChangelogCategory,
  ChangelogGeneratorConfig,
  ChangelogKeywordRule,
  ChangelogPathRule,
  ChangelogValidationDiagnostic
} from './types.js';

export const CHANGELOG_CATEGORIES = [
  'feature',
  'fix',
  'refactor',
  'docs',
  'infra',
  'test',
  'security',
  'performance',
  'chore',
  'unknown'
] as const satisfies readonly ChangelogCategory[];

export const DEFAULT_CHANGELOG_CATEGORY_ORDER: ChangelogCategory[] = [
  'feature',
  'fix',
  'security',
  'performance',
  'refactor',
  'docs',
  'test',
  'infra',
  'chore',
  'unknown'
];

const DEFAULT_KEYWORD_RULES: ChangelogKeywordRule[] = [
  { match: 'security', category: 'security', confidence: 0.8, field: 'any' },
  { match: 'vulnerability', category: 'security', confidence: 0.8, field: 'any' },
  { match: 'cve', category: 'security', confidence: 0.8, field: 'any' },
  { match: 'performance', category: 'performance', confidence: 0.8, field: 'any' },
  { match: 'perf', category: 'performance', confidence: 0.8, field: 'any' },
  { match: 'latency', category: 'performance', confidence: 0.8, field: 'any' },
  { match: 'bug', category: 'fix', confidence: 0.8, field: 'any' },
  { match: 'bugfix', category: 'fix', confidence: 0.8, field: 'any' },
  { match: 'regression', category: 'fix', confidence: 0.8, field: 'any' }
];

const DEFAULT_PATH_RULES: ChangelogPathRule[] = [
  { pattern: 'docs/**', category: 'docs', confidence: 0.6 },
  { pattern: 'README.md', category: 'docs', confidence: 0.6 },
  { pattern: 'tests/**', category: 'test', confidence: 0.6 },
  { pattern: 'test/**', category: 'test', confidence: 0.6 },
  { pattern: '**/*.test.ts', category: 'test', confidence: 0.6 },
  { pattern: '**/*.spec.ts', category: 'test', confidence: 0.6 },
  { pattern: '.github/**', category: 'infra', confidence: 0.6 },
  { pattern: 'scripts/**', category: 'infra', confidence: 0.6 },
  { pattern: 'pnpm-lock.yaml', category: 'infra', confidence: 0.6 },
  { pattern: 'packages/cli/src/commands/**', category: 'feature', confidence: 0.6 },
  { pattern: 'packages/engine/src/**', category: 'feature', confidence: 0.3 }
];

const DEFAULT_CONVENTIONAL_COMMIT_CATEGORIES: Record<string, ChangelogCategory> = {
  feat: 'feature',
  feature: 'feature',
  fix: 'fix',
  refactor: 'refactor',
  docs: 'docs',
  doc: 'docs',
  test: 'test',
  tests: 'test',
  chore: 'chore',
  perf: 'performance',
  performance: 'performance',
  security: 'security',
  sec: 'security',
  build: 'infra',
  ci: 'infra',
  deps: 'infra',
  dependency: 'infra'
};

const DEFAULT_BREAKING_CHANGE_MARKERS = [
  'BREAKING CHANGE:',
  'BREAKING-CHANGE',
  'PLAYBOOK_BREAKING_CHANGE'
];

const DEFAULT_SECURITY_MARKERS = [
  'security',
  'vulnerability',
  'CVE',
  'XSS',
  'injection',
  'auth bypass',
  'secret leak'
];

const isChangelogCategory = (value: string): value is ChangelogCategory =>
  (CHANGELOG_CATEGORIES as readonly string[]).includes(value);

const cloneKeywordRule = (rule: ChangelogKeywordRule): ChangelogKeywordRule => ({
  match: rule.match,
  category: rule.category,
  confidence: rule.confidence,
  field: rule.field
});

const clonePathRule = (rule: ChangelogPathRule): ChangelogPathRule => ({
  pattern: rule.pattern,
  category: rule.category,
  confidence: rule.confidence
});

const cloneStringArray = (values: string[]): string[] => [...values];

const cloneCategoryArray = (values: ChangelogCategory[]): ChangelogCategory[] => [...values];

const cloneConfig = (config: ChangelogGeneratorConfig): ChangelogGeneratorConfig => ({
  categoryOrder: cloneCategoryArray(config.categoryOrder),
  conventionalCommitCategories: { ...config.conventionalCommitCategories },
  keywordRules: config.keywordRules.map(cloneKeywordRule),
  pathRules: config.pathRules.map(clonePathRule),
  breakingChangeMarkers: cloneStringArray(config.breakingChangeMarkers),
  securityMarkers: cloneStringArray(config.securityMarkers),
  includeUnknown: config.includeUnknown,
  failOnUnknown: config.failOnUnknown,
  includeSourceRefs: config.includeSourceRefs,
  includeAuthors: config.includeAuthors,
  lowConfidenceThreshold: config.lowConfidenceThreshold,
  requireChanges: config.requireChanges,
  markdownHeading: config.markdownHeading,
  defaultTargetFile: config.defaultTargetFile,
  removeTicketIds: config.removeTicketIds
});

export const DEFAULT_CHANGELOG_GENERATOR_CONFIG: ChangelogGeneratorConfig = {
  categoryOrder: cloneCategoryArray(DEFAULT_CHANGELOG_CATEGORY_ORDER),
  conventionalCommitCategories: { ...DEFAULT_CONVENTIONAL_COMMIT_CATEGORIES },
  keywordRules: DEFAULT_KEYWORD_RULES.map(cloneKeywordRule),
  pathRules: DEFAULT_PATH_RULES.map(clonePathRule),
  breakingChangeMarkers: cloneStringArray(DEFAULT_BREAKING_CHANGE_MARKERS),
  securityMarkers: cloneStringArray(DEFAULT_SECURITY_MARKERS),
  includeUnknown: true,
  failOnUnknown: false,
  includeSourceRefs: true,
  includeAuthors: false,
  lowConfidenceThreshold: 0.3,
  requireChanges: false,
  markdownHeading: '# Changelog',
  defaultTargetFile: 'docs/CHANGELOG.md',
  removeTicketIds: false
};

export const getDefaultChangelogConfig = (): ChangelogGeneratorConfig =>
  cloneConfig(DEFAULT_CHANGELOG_GENERATOR_CONFIG);

export const normalizeChangelogCategory = (value: string): ChangelogCategory => {
  const normalized = value.trim().toLowerCase();
  return isChangelogCategory(normalized) ? normalized : 'unknown';
};

export const mergeChangelogConfig = (
  overrides: Partial<ChangelogGeneratorConfig> = {}
): ChangelogGeneratorConfig => {
  const defaults = getDefaultChangelogConfig();

  return {
    categoryOrder: overrides.categoryOrder ? cloneCategoryArray(overrides.categoryOrder) : defaults.categoryOrder,
    conventionalCommitCategories: {
      ...defaults.conventionalCommitCategories,
      ...(overrides.conventionalCommitCategories ?? {})
    },
    keywordRules: overrides.keywordRules ? overrides.keywordRules.map(cloneKeywordRule) : defaults.keywordRules,
    pathRules: overrides.pathRules ? overrides.pathRules.map(clonePathRule) : defaults.pathRules,
    breakingChangeMarkers: overrides.breakingChangeMarkers
      ? cloneStringArray(overrides.breakingChangeMarkers)
      : defaults.breakingChangeMarkers,
    securityMarkers: overrides.securityMarkers ? cloneStringArray(overrides.securityMarkers) : defaults.securityMarkers,
    includeUnknown: overrides.includeUnknown ?? defaults.includeUnknown,
    failOnUnknown: overrides.failOnUnknown ?? defaults.failOnUnknown,
    includeSourceRefs: overrides.includeSourceRefs ?? defaults.includeSourceRefs,
    includeAuthors: overrides.includeAuthors ?? defaults.includeAuthors,
    lowConfidenceThreshold: overrides.lowConfidenceThreshold ?? defaults.lowConfidenceThreshold,
    requireChanges: overrides.requireChanges ?? defaults.requireChanges,
    markdownHeading: overrides.markdownHeading ?? defaults.markdownHeading,
    defaultTargetFile: overrides.defaultTargetFile ?? defaults.defaultTargetFile,
    removeTicketIds: overrides.removeTicketIds ?? defaults.removeTicketIds
  };
};

export const validateChangelogConfig = (
  config: ChangelogGeneratorConfig
): ChangelogValidationDiagnostic[] => {
  const diagnostics: ChangelogValidationDiagnostic[] = [];

  if (config.categoryOrder.length === 0) {
    diagnostics.push({
      id: 'changelog.config.category-order.empty',
      severity: 'error',
      message: 'categoryOrder must contain at least one changelog category.',
      evidence: 'categoryOrder=[]'
    });
  }

  const seenCategories = new Set<string>();
  for (const category of config.categoryOrder) {
    if (!isChangelogCategory(category)) {
      diagnostics.push({
        id: 'changelog.config.category-order.invalid-category',
        severity: 'error',
        message: `categoryOrder contains unsupported category "${String(category)}".`,
        evidence: `categoryOrder=${JSON.stringify(config.categoryOrder)}`
      });
      continue;
    }

    if (seenCategories.has(category)) {
      diagnostics.push({
        id: 'changelog.config.category-order.duplicate-category',
        severity: 'error',
        message: `categoryOrder contains duplicate category "${category}".`,
        category,
        evidence: `categoryOrder=${JSON.stringify(config.categoryOrder)}`
      });
      continue;
    }

    seenCategories.add(category);
  }

  for (const [prefix, category] of Object.entries(config.conventionalCommitCategories)) {
    if (!isChangelogCategory(category)) {
      diagnostics.push({
        id: 'changelog.config.conventional.invalid-category',
        severity: 'error',
        message: `conventionalCommitCategories maps prefix "${prefix}" to unsupported category "${String(category)}".`,
        evidence: `${prefix}=${String(category)}`
      });
    }
  }

  for (const rule of config.keywordRules) {
    if (!isChangelogCategory(rule.category)) {
      diagnostics.push({
        id: 'changelog.config.keyword-rule.invalid-category',
        severity: 'error',
        message: `keywordRules contains unsupported category "${String(rule.category)}" for match "${rule.match}".`,
        evidence: `${rule.match}=${String(rule.category)}`
      });
    }
  }

  for (const rule of config.pathRules) {
    if (!isChangelogCategory(rule.category)) {
      diagnostics.push({
        id: 'changelog.config.path-rule.invalid-category',
        severity: 'error',
        message: `pathRules contains unsupported category "${String(rule.category)}" for pattern "${rule.pattern}".`,
        evidence: `${rule.pattern}=${String(rule.category)}`
      });
    }
  }

  if (config.lowConfidenceThreshold < 0 || config.lowConfidenceThreshold > 1) {
    diagnostics.push({
      id: 'changelog.config.low-confidence-threshold.out-of-range',
      severity: 'error',
      message: 'lowConfidenceThreshold must be between 0 and 1 inclusive.',
      evidence: `lowConfidenceThreshold=${String(config.lowConfidenceThreshold)}`
    });
  }

  if (config.markdownHeading.trim().length === 0) {
    diagnostics.push({
      id: 'changelog.config.markdown-heading.missing',
      severity: 'error',
      message: 'markdownHeading must not be empty.',
      evidence: `markdownHeading=${JSON.stringify(config.markdownHeading)}`
    });
  }

  if (config.defaultTargetFile.trim().length === 0) {
    diagnostics.push({
      id: 'changelog.config.default-target-file.missing',
      severity: 'error',
      message: 'defaultTargetFile must not be empty.',
      evidence: `defaultTargetFile=${JSON.stringify(config.defaultTargetFile)}`
    });
  }

  return diagnostics;
};
