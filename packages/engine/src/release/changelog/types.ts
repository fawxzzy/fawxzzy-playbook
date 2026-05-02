export type ChangelogSourceType = 'commit' | 'pull_request' | 'manual';

export type ChangelogCategory =
  | 'feature'
  | 'fix'
  | 'refactor'
  | 'docs'
  | 'infra'
  | 'test'
  | 'security'
  | 'performance'
  | 'chore'
  | 'unknown';

export type ChangelogAuthor = {
  name: string;
  email?: string;
};

export type ChangelogFileChange = {
  path: string;
  status?: string;
};

export type RawChangelogChange = {
  id: string;
  shortId?: string;
  sourceType: ChangelogSourceType;
  title: string;
  body?: string;
  author?: ChangelogAuthor;
  date?: string;
  files?: ChangelogFileChange[];
  labels?: string[];
  url?: string;
  metadata?: Record<string, unknown>;
};

export type ClassifiedChangelogChange = {
  raw: RawChangelogChange;
  category: ChangelogCategory;
  confidence: number;
  reasons: string[];
  breakingChange: boolean;
  securityRelated: boolean;
};

export type ChangelogEntry = {
  category: ChangelogCategory;
  what: string;
  why: string;
  sourceRefs: string[];
  breakingChange: boolean;
  securityRelated: boolean;
  confidence?: number;
  reasons?: string[];
};

export type ChangelogSection = {
  category: ChangelogCategory;
  entries: ChangelogEntry[];
};

export type ChangelogDocument = {
  schemaVersion: '1.0';
  kind: 'playbook-changelog';
  generatedAt?: string;
  baseRef?: string;
  headRef?: string;
  version?: string;
  sections: ChangelogSection[];
};

export type ChangelogKeywordRuleField = 'title' | 'body' | 'label' | 'any';

export type ChangelogKeywordRule = {
  match: string;
  category: ChangelogCategory;
  confidence?: number;
  field?: ChangelogKeywordRuleField;
};

export type ChangelogPathRule = {
  pattern: string;
  category: ChangelogCategory;
  confidence?: number;
};

export type ChangelogGeneratorConfig = {
  categoryOrder: ChangelogCategory[];
  conventionalCommitCategories: Record<string, ChangelogCategory>;
  keywordRules: ChangelogKeywordRule[];
  pathRules: ChangelogPathRule[];
  breakingChangeMarkers: string[];
  securityMarkers: string[];
  includeUnknown: boolean;
  failOnUnknown: boolean;
  includeSourceRefs: boolean;
  includeAuthors: boolean;
  lowConfidenceThreshold: number;
  requireChanges: boolean;
  markdownHeading: string;
  defaultTargetFile: string;
  removeTicketIds: boolean;
};

export type ChangelogValidationDiagnosticSeverity = 'info' | 'warning' | 'error';

export type ChangelogValidationDiagnostic = {
  id: string;
  severity: ChangelogValidationDiagnosticSeverity;
  message: string;
  category?: ChangelogCategory;
  sourceRef?: string;
  evidence?: string;
};
