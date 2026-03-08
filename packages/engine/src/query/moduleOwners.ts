import fs from 'node:fs';
import path from 'node:path';
import type { RepositoryIndex } from '../indexer/repoIndexer.js';
import { resolveRepositoryTarget } from '../intelligence/targetResolver.js';

export type ModuleOwnershipStatus =
  | 'configured'
  | 'no-metadata-configured'
  | 'intentionally-unowned'
  | 'inherited-default'
  | 'unresolved-mapping';

export type ModuleOwnershipEntry = {
  name: string;
  owners: string[];
  area: string;
  ownership: {
    status: ModuleOwnershipStatus;
    source: string;
    sourceLocation?: string;
  };
};

export type ModuleOwnersQueryResult =
  | {
      schemaVersion: '1.0';
      command: 'query';
      type: 'module-owners';
      contract: {
        minimumFields: readonly ['owners', 'area', 'sourceLocation'];
        metadataPath: '.playbook/module-owners.json';
      };
      diagnostics: string[];
      modules: ModuleOwnershipEntry[];
    }
  | {
      schemaVersion: '1.0';
      command: 'query';
      type: 'module-owners';
      contract: {
        minimumFields: readonly ['owners', 'area', 'sourceLocation'];
        metadataPath: '.playbook/module-owners.json';
      };
      diagnostics: string[];
      module: ModuleOwnershipEntry;
    };

type ModuleOwnersMapping = Record<string, { owners?: unknown; area?: unknown; sourceLocation?: unknown; status?: unknown }>;

const INDEX_RELATIVE_PATH = '.playbook/repo-index.json' as const;
const OWNERS_RELATIVE_PATH = '.playbook/module-owners.json' as const;
const DEFAULT_AREA = 'unassigned' as const;

const readRepositoryIndex = (projectRoot: string): RepositoryIndex => {
  const indexPath = path.join(projectRoot, INDEX_RELATIVE_PATH);
  if (!fs.existsSync(indexPath)) {
    throw new Error('playbook query: missing repository index at .playbook/repo-index.json. Run "playbook index" first.');
  }

  const raw = fs.readFileSync(indexPath, 'utf8');
  const parsed = JSON.parse(raw) as Partial<RepositoryIndex>;

  if (parsed.schemaVersion !== '1.0') {
    throw new Error(
      `playbook query: unsupported repository index schemaVersion "${String(parsed.schemaVersion)}". Expected "1.0".`
    );
  }

  return parsed as RepositoryIndex;
};

const readModuleOwnersMapping = (projectRoot: string): ModuleOwnersMapping => {
  const ownersPath = path.join(projectRoot, OWNERS_RELATIVE_PATH);
  if (!fs.existsSync(ownersPath)) {
    return {};
  }

  const raw = fs.readFileSync(ownersPath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('playbook query module-owners: invalid ownership mapping at .playbook/module-owners.json. Expected an object keyed by module name.');
  }

  return parsed as ModuleOwnersMapping;
};

const sanitizeOwners = (owners: unknown): string[] => {
  if (!Array.isArray(owners)) {
    return [];
  }

  return owners
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
};

const sanitizeArea = (area: unknown): string => {
  if (typeof area !== 'string') {
    return DEFAULT_AREA;
  }

  const trimmed = area.trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_AREA;
};

const sanitizeSourceLocation = (sourceLocation: unknown): string | undefined => {
  if (typeof sourceLocation !== 'string') {
    return undefined;
  }

  const trimmed = sourceLocation.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const resolveOwnershipStatus = (
  mappingPresent: boolean,
  mapped: { owners?: unknown; area?: unknown; sourceLocation?: unknown; status?: unknown } | undefined,
  owners: string[]
): ModuleOwnershipStatus => {
  if (!mappingPresent) {
    return 'no-metadata-configured';
  }

  if (!mapped) {
    return 'unresolved-mapping';
  }

  if (mapped.status === 'intentionally-unowned') {
    return 'intentionally-unowned';
  }

  if (owners.length === 0) {
    return 'inherited-default';
  }

  return 'configured';
};

const toOwnershipEntry = (moduleName: string, mapping: ModuleOwnersMapping): ModuleOwnershipEntry => {
  const mapped = mapping[moduleName];
  const owners = sanitizeOwners(mapped?.owners);
  const area = sanitizeArea(mapped?.area);
  const sourceLocation = sanitizeSourceLocation(mapped?.sourceLocation);
  const status = resolveOwnershipStatus(Object.keys(mapping).length > 0, mapped, owners);

  return {
    name: moduleName,
    owners,
    area,
    ownership: {
      status,
      source: Object.keys(mapping).length > 0 ? OWNERS_RELATIVE_PATH : 'generated-default',
      sourceLocation
    }
  };
};

const buildDiagnostics = (entries: ModuleOwnershipEntry[], mappingPresent: boolean): string[] => {
  const diagnostics: string[] = [];
  if (!mappingPresent) {
    diagnostics.push('No ownership metadata configured at .playbook/module-owners.json.');
    return diagnostics;
  }

  if (entries.some((entry) => entry.ownership.status === 'unresolved-mapping')) {
    diagnostics.push('Some indexed modules are missing ownership mappings and are marked unresolved-mapping.');
  }

  if (entries.some((entry) => entry.ownership.status === 'inherited-default')) {
    diagnostics.push('Some modules use inherited-default ownership because owners are empty.');
  }

  if (entries.some((entry) => entry.ownership.status === 'configured' && !entry.ownership.sourceLocation)) {
    diagnostics.push('Ownership metadata is configured without sourceLocation for one or more modules.');
  }

  return diagnostics;
};

const queryContract = {
  minimumFields: ['owners', 'area', 'sourceLocation'],
  metadataPath: OWNERS_RELATIVE_PATH
} as const;

export const queryModuleOwners = (projectRoot: string, moduleName?: string): ModuleOwnersQueryResult => {
  const index = readRepositoryIndex(projectRoot);
  const mapping = readModuleOwnersMapping(projectRoot);

  const allEntries = index.modules
    .map((moduleEntry) => moduleEntry.name)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => toOwnershipEntry(name, mapping));
  const diagnostics = buildDiagnostics(allEntries, Object.keys(mapping).length > 0);

  if (moduleName) {
    const resolved = resolveRepositoryTarget(projectRoot, moduleName);
    if (resolved.kind !== 'module') {
      throw new Error(`playbook query module-owners: unknown module "${moduleName}".`);
    }

    const entry = allEntries.find((moduleEntry) => moduleEntry.name === resolved.selector);
    if (!entry) {
      throw new Error(`playbook query module-owners: unknown module "${moduleName}".`);
    }

    return {
      schemaVersion: '1.0',
      command: 'query',
      type: 'module-owners',
      contract: queryContract,
      diagnostics,
      module: entry
    };
  }

  return {
    schemaVersion: '1.0',
    command: 'query',
    type: 'module-owners',
    contract: queryContract,
    diagnostics,
    modules: allEntries
  };
};
