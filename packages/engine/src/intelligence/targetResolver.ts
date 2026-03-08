import type { RepositoryModule } from '../indexer/repoIndexer.js';
import { queryRepositoryIndex } from '../query/repoQuery.js';
import { getRuleMetadata } from '../explain/ruleRegistry.js';

export type TargetKind = 'module' | 'rule' | 'architecture' | 'unknown';

export type ResolvedTarget = {
  input: string;
  kind: TargetKind;
  selector: string;
  canonical: string;
  matched: boolean;
};

const toModuleNames = (modules: string[] | RepositoryModule[]): string[] => {
  if (modules.length === 0) {
    return [];
  }

  const first = modules[0];
  if (typeof first === 'string') {
    return modules as string[];
  }

  return (modules as RepositoryModule[]).map((moduleEntry) => moduleEntry.name);
};

const parseSelector = (input: string): { type: string | null; target: string } => {
  const trimmed = input.trim();
  const index = trimmed.indexOf(':');

  if (index <= 0) {
    return { type: null, target: trimmed };
  }

  return {
    type: trimmed.slice(0, index).trim().toLowerCase(),
    target: trimmed.slice(index + 1).trim()
  };
};

const resolveModule = (input: string, modules: string[]): ResolvedTarget => {
  const { target } = parseSelector(input);
  const matchedModule = modules.find((moduleName) => moduleName.toLowerCase() === target.toLowerCase());

  if (!matchedModule) {
    return {
      input,
      kind: 'unknown',
      selector: input.trim(),
      canonical: input.trim(),
      matched: false
    };
  }

  return {
    input,
    kind: 'module',
    selector: matchedModule,
    canonical: `module:${matchedModule}`,
    matched: true
  };
};

const resolveRule = (input: string, rules: string[]): ResolvedTarget => {
  const { target } = parseSelector(input);
  const matchedRule = rules.find((ruleId) => ruleId.toLowerCase() === target.toLowerCase()) ?? getRuleMetadata(target)?.id;

  if (!matchedRule) {
    return {
      input,
      kind: 'unknown',
      selector: input.trim(),
      canonical: input.trim(),
      matched: false
    };
  }

  return {
    input,
    kind: 'rule',
    selector: matchedRule,
    canonical: `rule:${matchedRule}`,
    matched: true
  };
};

export const resolveRepositoryTarget = (projectRoot: string, input: string): ResolvedTarget => {
  const modules = toModuleNames(queryRepositoryIndex(projectRoot, 'modules').result as string[] | RepositoryModule[]);
  const rules = queryRepositoryIndex(projectRoot, 'rules').result as string[];
  const normalized = input.trim();
  const parsed = parseSelector(normalized);

  if (parsed.type === 'module') {
    return resolveModule(normalized, modules);
  }

  if (parsed.type === 'rule') {
    return resolveRule(normalized, rules);
  }

  if (parsed.type === 'architecture' || normalized.toLowerCase() === 'architecture') {
    return {
      input,
      kind: 'architecture',
      selector: 'architecture',
      canonical: 'architecture',
      matched: true
    };
  }

  const moduleResolution = resolveModule(normalized, modules);
  if (moduleResolution.matched) {
    return moduleResolution;
  }

  const ruleResolution = resolveRule(normalized, rules);
  if (ruleResolution.matched) {
    return ruleResolution;
  }

  return {
    input,
    kind: 'unknown',
    selector: normalized,
    canonical: normalized,
    matched: false
  };
};
