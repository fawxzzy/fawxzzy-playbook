import { mergeChangelogConfig } from './config.js';
import type {
  ChangelogCategory,
  ChangelogEntry,
  ChangelogGeneratorConfig,
  ClassifiedChangelogChange
} from './types.js';

const FALLBACK_WHY_BY_CATEGORY: Record<ChangelogCategory, string> = {
  feature: 'Adds new capability for users or maintainers.',
  fix: 'Corrects incorrect behavior.',
  refactor: 'Improves maintainability without intended behavior change.',
  docs: 'Improves project documentation.',
  infra: 'Improves build, release, dependency, or operational support.',
  test: 'Improves verification coverage.',
  security: 'Reduces security risk.',
  performance: 'Improves runtime or resource behavior.',
  chore: 'Keeps project maintenance current.',
  unknown: 'Change intent was not clearly classified.'
};

const stripConventionalPrefix = (title: string): string => {
  const trimmed = title.trim();
  const match = /^(?<prefix>[a-z]+)(?<breaking>!)?(?:\((?<scope>[^)]*)\))?:\s*(?<rest>.+)$/i.exec(trimmed);
  if (!match?.groups?.rest) {
    return trimmed;
  }

  const scope = match.groups.scope?.trim();
  const rest = match.groups.rest.trim();
  return scope ? `${scope}: ${rest}` : rest;
};

const stripLeadingTicketIds = (value: string): string =>
  value
    .replace(/^(?:\[[A-Z]+-\d+\]\s*)+/u, '')
    .replace(/^(?:[A-Z]+-\d+[:\]-]?\s*)+/u, '')
    .replace(/^(?:#\d+[:\]-]?\s*)+/u, '')
    .trim();

const extractWhyFromBody = (body: string | undefined): string | null => {
  if (!body) {
    return null;
  }

  const lines = body.split(/\r?\n/u);
  for (const line of lines) {
    const match = /^(Why|WHY|Rationale|Motivation):\s*(.+)$/u.exec(line.trim());
    if (match?.[2]) {
      return match[2].trim();
    }
  }

  return null;
};

const buildWhat = (title: string, removeTicketIds: boolean): string => {
  const withoutPrefix = stripConventionalPrefix(title);
  return removeTicketIds ? stripLeadingTicketIds(withoutPrefix) : withoutPrefix;
};

const buildSourceRefs = (
  classifiedChange: ClassifiedChangelogChange,
  config: ChangelogGeneratorConfig
): string[] => {
  const refs: string[] = [];
  const primaryRef = classifiedChange.raw.shortId ?? classifiedChange.raw.id;
  if (config.includeSourceRefs && primaryRef) {
    refs.push(primaryRef);
  }

  if (config.includeSourceRefs && classifiedChange.raw.url) {
    refs.push(classifiedChange.raw.url);
  }

  if (config.includeAuthors && classifiedChange.raw.author?.name) {
    refs.push(classifiedChange.raw.author.email
      ? `${classifiedChange.raw.author.name} <${classifiedChange.raw.author.email}>`
      : classifiedChange.raw.author.name);
  }

  return refs;
};

const getStableDeduplicationKey = (entry: ChangelogEntry, fallbackIndex: number): string => {
  const firstSourceRef = entry.sourceRefs[0];
  if (firstSourceRef) {
    return firstSourceRef;
  }

  return `${entry.category}:${entry.what}:${fallbackIndex}`;
};

export const buildChangelogEntry = (
  classifiedChange: ClassifiedChangelogChange,
  configOverrides: Partial<ChangelogGeneratorConfig> = {}
): ChangelogEntry => {
  const config = mergeChangelogConfig(configOverrides);
  return {
    category: classifiedChange.category,
    what: buildWhat(classifiedChange.raw.title, config.removeTicketIds),
    why: extractWhyFromBody(classifiedChange.raw.body) ?? FALLBACK_WHY_BY_CATEGORY[classifiedChange.category],
    sourceRefs: buildSourceRefs(classifiedChange, config),
    breakingChange: classifiedChange.breakingChange,
    securityRelated: classifiedChange.securityRelated,
    confidence: classifiedChange.confidence,
    reasons: [...classifiedChange.reasons]
  };
};

export const buildChangelogEntries = (
  classifiedChanges: ClassifiedChangelogChange[],
  configOverrides: Partial<ChangelogGeneratorConfig> = {}
): ChangelogEntry[] => {
  const seen = new Set<string>();
  const entries = classifiedChanges.map((classifiedChange) =>
    buildChangelogEntry(classifiedChange, configOverrides)
  );

  return entries.filter((entry, index) => {
    const key = getStableDeduplicationKey(entry, index);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};
