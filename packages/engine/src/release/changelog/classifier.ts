import { minimatch } from 'minimatch';
import { mergeChangelogConfig } from './config.js';
import type {
  ChangelogCategory,
  ChangelogGeneratorConfig,
  ChangelogKeywordRule,
  ChangelogPathRule,
  ClassifiedChangelogChange,
  RawChangelogChange
} from './types.js';

type MatchSource = 'conventional' | 'label' | 'title-keyword' | 'body-keyword' | 'path-rule';

type ClassificationMatch = {
  category: ChangelogCategory;
  confidence: number;
  reason: string;
  source: MatchSource;
};

const SOURCE_PRIORITY: Record<MatchSource, number> = {
  conventional: 5,
  label: 4,
  'title-keyword': 3,
  'path-rule': 2,
  'body-keyword': 1
};

const normalizeValue = (value: string): string => value.trim().toLowerCase();

const getPathRuleConfidence = (rule: ChangelogPathRule): number => rule.confidence ?? 0.6;

const splitLeadingToken = (title: string): { prefix: string; breaking: boolean } | null => {
  const match = /^(?<prefix>[a-z]+)(?<breaking>!)?(?:\([^)]*\))?:/i.exec(title.trim());
  if (!match?.groups?.prefix) {
    return null;
  }

  return {
    prefix: normalizeValue(match.groups.prefix),
    breaking: match.groups.breaking === '!'
  };
};

const containsMarker = (value: string, markers: string[]): string | null => {
  const lowered = value.toLowerCase();
  for (const marker of markers) {
    if (lowered.includes(marker.toLowerCase())) {
      return marker;
    }
  }

  return null;
};

const detectBreakingChange = (rawChange: RawChangelogChange, config: ChangelogGeneratorConfig): boolean => {
  const prefix = splitLeadingToken(rawChange.title);
  if (prefix?.breaking) {
    return true;
  }

  const body = rawChange.body ?? '';
  return containsMarker(`${rawChange.title}\n${body}`, config.breakingChangeMarkers) !== null;
};

const getLabelMatches = (
  rawChange: RawChangelogChange,
  config: ChangelogGeneratorConfig
): ClassificationMatch[] => {
  const labels = rawChange.labels ?? [];
  const aliasEntries = Object.entries(config.conventionalCommitCategories);
  const matches: ClassificationMatch[] = [];

  for (const label of labels) {
    const normalizedLabel = normalizeValue(label);

    for (const [alias, category] of aliasEntries) {
      if (normalizedLabel === alias || normalizedLabel === category) {
        matches.push({
          category,
          confidence: 1,
          reason: `matched label "${label}"`,
          source: 'label'
        });
      }
    }

    if (normalizedLabel.includes('security')) {
      matches.push({
        category: 'security',
        confidence: 1,
        reason: `matched label "${label}"`,
        source: 'label'
      });
    }
  }

  return matches;
};

const getConventionalCommitMatch = (
  rawChange: RawChangelogChange,
  config: ChangelogGeneratorConfig
): ClassificationMatch[] => {
  const token = splitLeadingToken(rawChange.title);
  if (!token) {
    return [];
  }

  const category = config.conventionalCommitCategories[token.prefix];
  if (!category) {
    return [];
  }

  return [
    {
      category,
      confidence: 1,
      reason: `matched conventional commit prefix "${token.prefix}"`,
      source: 'conventional'
    }
  ];
};

const getKeywordMatches = (
  value: string,
  field: 'title' | 'body',
  config: ChangelogGeneratorConfig
): ClassificationMatch[] => {
  const normalizedValue = value.toLowerCase();

  return config.keywordRules.flatMap((rule: ChangelogKeywordRule) => {
    const appliesToField = rule.field === undefined || rule.field === 'any' || rule.field === field;
    if (!appliesToField) {
      return [];
    }

    if (!normalizedValue.includes(rule.match.toLowerCase())) {
      return [];
    }

    const confidence =
      field === 'body' ? Math.min(rule.confidence ?? 0.8, 0.3) : rule.confidence ?? 0.8;

    return [
      {
        category: rule.category,
        confidence,
        reason: `matched ${field} keyword "${rule.match}"`,
        source: field === 'title' ? 'title-keyword' : 'body-keyword'
      }
    ];
  });
};

const matchPathRule = (pathValue: string, rule: ChangelogPathRule): boolean =>
  minimatch(pathValue, rule.pattern, { dot: true }) || minimatch(`${pathValue}/`, rule.pattern, { dot: true });

const getPathMatches = (
  rawChange: RawChangelogChange,
  config: ChangelogGeneratorConfig
): ClassificationMatch[] => {
  const files = rawChange.files ?? [];
  const matches: ClassificationMatch[] = [];

  for (const file of files) {
    for (const rule of config.pathRules) {
      if (!matchPathRule(file.path, rule)) {
        continue;
      }

      matches.push({
        category: rule.category,
        confidence: getPathRuleConfidence(rule),
        reason: `matched file path pattern "${rule.pattern}"`,
        source: 'path-rule'
      });
    }
  }

  return matches;
};

const chooseBestMatch = (matches: ClassificationMatch[]): ClassificationMatch | null => {
  if (matches.length === 0) {
    return null;
  }

  return matches.slice(1).reduce<ClassificationMatch>((best, current) => {
    if (current.confidence !== best.confidence) {
      return current.confidence > best.confidence ? current : best;
    }

    if (SOURCE_PRIORITY[current.source] !== SOURCE_PRIORITY[best.source]) {
      return SOURCE_PRIORITY[current.source] > SOURCE_PRIORITY[best.source] ? current : best;
    }

    if (current.reason !== best.reason) {
      return current.reason < best.reason ? current : best;
    }

    return current.category < best.category ? current : best;
  }, matches[0]);
};

const buildReasons = (
  bestMatch: ClassificationMatch | null,
  breakingChange: boolean,
  securityRelated: boolean,
  rawChange: RawChangelogChange,
  config: ChangelogGeneratorConfig
): string[] => {
  const reasons = new Set<string>();
  if (bestMatch) {
    reasons.add(bestMatch.reason);
  } else {
    reasons.add('no classification rule matched');
  }

  const token = splitLeadingToken(rawChange.title);
  if (token?.breaking) {
    reasons.add(`detected breaking change marker "${token.prefix}!"`);
  } else {
    const marker = containsMarker(`${rawChange.title}\n${rawChange.body ?? ''}`, config.breakingChangeMarkers);
    if (breakingChange && marker) {
      reasons.add(`detected breaking change marker "${marker}"`);
    }
  }

  const securityMarker = containsMarker(
    `${rawChange.title}\n${rawChange.body ?? ''}\n${(rawChange.labels ?? []).join('\n')}`,
    config.securityMarkers
  );
  if (securityRelated && securityMarker) {
    reasons.add(`detected security marker "${securityMarker}"`);
  }

  return [...reasons];
};

const isSecurityRelated = (
  rawChange: RawChangelogChange,
  category: ChangelogCategory,
  config: ChangelogGeneratorConfig
): boolean => {
  if (category === 'security') {
    return true;
  }

  if ((rawChange.labels ?? []).some((label) => normalizeValue(label).includes('security'))) {
    return true;
  }

  return (
    containsMarker(`${rawChange.title}\n${rawChange.body ?? ''}`, config.securityMarkers) !== null
  );
};

export const classifyChangelogChange = (
  rawChange: RawChangelogChange,
  configOverrides: Partial<ChangelogGeneratorConfig> = {}
): ClassifiedChangelogChange => {
  const config = mergeChangelogConfig(configOverrides);
  const matches = [
    ...getConventionalCommitMatch(rawChange, config),
    ...getLabelMatches(rawChange, config),
    ...getKeywordMatches(rawChange.title, 'title', config),
    ...getKeywordMatches(rawChange.body ?? '', 'body', config),
    ...getPathMatches(rawChange, config)
  ];

  const bestMatch = chooseBestMatch(matches);
  const category = bestMatch?.category ?? 'unknown';
  const confidence = bestMatch?.confidence ?? 0.1;
  const breakingChange = detectBreakingChange(rawChange, config);
  const securityRelated = isSecurityRelated(rawChange, category, config);

  return {
    raw: rawChange,
    category,
    confidence,
    reasons: buildReasons(bestMatch, breakingChange, securityRelated, rawChange, config),
    breakingChange,
    securityRelated
  };
};

export const classifyChangelogChanges = (
  rawChanges: RawChangelogChange[],
  configOverrides: Partial<ChangelogGeneratorConfig> = {}
): ClassifiedChangelogChange[] =>
  rawChanges.map((rawChange) => classifyChangelogChange(rawChange, configOverrides));
