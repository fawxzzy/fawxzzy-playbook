import { mergeChangelogConfig } from './config.js';
import type { ChangelogCategory, ChangelogEntry, ChangelogGeneratorConfig } from './types.js';

export type RenderMarkdownChangelogOptions = {
  configOverrides?: Partial<ChangelogGeneratorConfig>;
  baseRef?: string;
  headRef?: string;
  version?: string;
  date?: string;
  heading?: string;
  includeUnknown?: boolean;
  includeSourceRefs?: boolean;
};

const CATEGORY_HEADINGS: Record<ChangelogCategory, string> = {
  feature: 'Features',
  fix: 'Fixes',
  refactor: 'Refactors',
  docs: 'Documentation',
  infra: 'Infrastructure',
  test: 'Tests',
  security: 'Security',
  performance: 'Performance',
  chore: 'Chores',
  unknown: 'Unknown'
};

const filterEntries = (
  entries: readonly ChangelogEntry[],
  includeUnknown: boolean
): ChangelogEntry[] => (includeUnknown ? [...entries] : entries.filter((entry) => entry.category !== 'unknown'));

const orderEntriesByCategory = (
  entries: readonly ChangelogEntry[],
  categoryOrder: readonly ChangelogCategory[]
): Map<ChangelogCategory, ChangelogEntry[]> => {
  const grouped = new Map<ChangelogCategory, ChangelogEntry[]>();

  for (const category of categoryOrder) {
    grouped.set(category, []);
  }

  for (const entry of entries) {
    if (!grouped.has(entry.category)) {
      grouped.set(entry.category, []);
    }

    grouped.get(entry.category)!.push(entry);
  }

  return grouped;
};

const buildVersionHeading = (version?: string, date?: string): string | null => {
  if (!version && !date) {
    return null;
  }

  if (version && date) {
    return `## ${version} (${date})`;
  }

  return `## ${version ?? date}`;
};

const formatFlags = (entry: ChangelogEntry): string => {
  const flags: string[] = [];

  if (entry.breakingChange) {
    flags.push(['BREAKING', 'CHANGE'].join(' '));
  }

  if (entry.securityRelated) {
    flags.push('SECURITY-RELATED');
  }

  return flags.length > 0 ? ` [${flags.join(', ')}]` : '';
};

const formatSourceLine = (entry: ChangelogEntry, includeSourceRefs: boolean): string[] => {
  if (!includeSourceRefs || entry.sourceRefs.length === 0) {
    return [];
  }

  return [`  Source: ${entry.sourceRefs.join(', ')}`];
};

const formatEntry = (entry: ChangelogEntry, includeSourceRefs: boolean): string[] => [
  `- **WHAT:** ${entry.what}${formatFlags(entry)}`,
  `  **WHY:** ${entry.why}`,
  ...formatSourceLine(entry, includeSourceRefs)
];

export const renderMarkdownChangelog = (
  entries: readonly ChangelogEntry[],
  options: RenderMarkdownChangelogOptions = {}
): string => {
  const config = mergeChangelogConfig(options.configOverrides);
  const includeUnknown = options.includeUnknown ?? config.includeUnknown;
  const includeSourceRefs = options.includeSourceRefs ?? config.includeSourceRefs;
  const filteredEntries = filterEntries(entries, includeUnknown);
  const groupedEntries = orderEntriesByCategory(filteredEntries, config.categoryOrder);
  const lines: string[] = [options.heading ?? config.markdownHeading];
  const versionHeading = buildVersionHeading(options.version, options.date);

  if (versionHeading) {
    lines.push('', versionHeading);
  }

  const categoryHeadingLevel = versionHeading ? '###' : '##';

  for (const category of config.categoryOrder) {
    const categoryEntries = groupedEntries.get(category) ?? [];
    if (categoryEntries.length === 0) {
      continue;
    }

    lines.push('', `${categoryHeadingLevel} ${CATEGORY_HEADINGS[category]}`);

    for (const entry of categoryEntries) {
      lines.push(...formatEntry(entry, includeSourceRefs), '');
    }

    if (lines[lines.length - 1] === '') {
      lines.pop();
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
};
