import { mergeChangelogConfig } from './config.js';
import type {
  ChangelogCategory,
  ChangelogDocument,
  ChangelogEntry,
  ChangelogGeneratorConfig,
  ChangelogSection
} from './types.js';

export type RenderJsonChangelogOptions = {
  configOverrides?: Partial<ChangelogGeneratorConfig>;
  baseRef?: string;
  headRef?: string;
  version?: string;
  generatedAt?: string;
  includeUnknown?: boolean;
};

const filterEntries = (
  entries: readonly ChangelogEntry[],
  includeUnknown: boolean
): ChangelogEntry[] => (includeUnknown ? [...entries] : entries.filter((entry) => entry.category !== 'unknown'));

const buildSections = (
  entries: readonly ChangelogEntry[],
  categoryOrder: readonly ChangelogCategory[]
): ChangelogSection[] => {
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

  const sections: ChangelogSection[] = [];

  for (const category of categoryOrder) {
    const categoryEntries = grouped.get(category) ?? [];
    if (categoryEntries.length === 0) {
      continue;
    }

    sections.push({
      category,
      entries: categoryEntries.map((entry) => ({
        category: entry.category,
        what: entry.what,
        why: entry.why,
        sourceRefs: [...entry.sourceRefs],
        breakingChange: entry.breakingChange,
        securityRelated: entry.securityRelated,
        confidence: entry.confidence,
        reasons: entry.reasons ? [...entry.reasons] : undefined
      }))
    });
  }

  return sections;
};

export const renderJsonChangelog = (
  entries: readonly ChangelogEntry[],
  options: RenderJsonChangelogOptions = {}
): ChangelogDocument => {
  const config = mergeChangelogConfig(options.configOverrides);
  const includeUnknown = options.includeUnknown ?? config.includeUnknown;
  const filteredEntries = filterEntries(entries, includeUnknown);
  const sections = buildSections(filteredEntries, config.categoryOrder);

  return {
    schemaVersion: '1.0',
    kind: 'playbook-changelog',
    generatedAt: options.generatedAt,
    baseRef: options.baseRef,
    headRef: options.headRef,
    version: options.version,
    sections
  };
};
