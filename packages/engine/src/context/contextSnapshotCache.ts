import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const CONTEXT_CACHE_DIR_RELATIVE_PATH = '.playbook/context' as const;
export const CONTEXT_CACHE_SNAPSHOTS_DIR_RELATIVE_PATH = '.playbook/context/snapshots' as const;
export const CONTEXT_CACHE_INDEX_RELATIVE_PATH = '.playbook/context/cache-index.json' as const;
export const CONTEXT_CACHE_SCHEMA_VERSION = '1.0' as const;
const DEFAULT_MAX_AGE_MS = 1000 * 60 * 60 * 6;

export type ContextCacheScopeKind = 'repo' | 'module' | 'subapp';

export type ContextCacheScope = {
  kind: ContextCacheScopeKind;
  id: string;
};

export type ContextCacheSourceFingerprint = {
  artifact: string;
  fingerprint: string;
  present: boolean;
};

export type ContextCacheInvalidationReason =
  | 'none'
  | 'cache-miss'
  | 'snapshot-missing'
  | 'source-fingerprint-drift'
  | 'policy-expired'
  | 'cache-key-collision';

export type ContextCacheIndexEntry = {
  cacheKey: string;
  scope: ContextCacheScope;
  shapingLevel: string;
  riskTier: string;
  generatedAt: string;
  lastValidatedAt: string;
  expiresAt: string;
  invalidationReason: ContextCacheInvalidationReason;
  sourceFingerprints: ContextCacheSourceFingerprint[];
  snapshotPath: string;
};

export type ContextCacheIndexArtifact = {
  schemaVersion: typeof CONTEXT_CACHE_SCHEMA_VERSION;
  kind: 'playbook-context-cache-index';
  generatedAt: string;
  entries: ContextCacheIndexEntry[];
};

export type ContextCacheMetadata = {
  cacheKey: string;
  reused: boolean;
  scope: ContextCacheScope;
  shapingLevel: string;
  riskTier: string;
  generatedAt: string;
  invalidationReason: ContextCacheInvalidationReason;
  sourceFingerprints: ContextCacheSourceFingerprint[];
  indexPath: typeof CONTEXT_CACHE_INDEX_RELATIVE_PATH;
  snapshotPath: string;
  expiresAt: string;
};

export type ResolveContextSnapshotCacheOptions<T> = {
  projectRoot: string;
  scope: ContextCacheScope;
  shapingLevel: string;
  riskTier: string;
  sourceArtifacts: string[];
  maxAgeMs?: number;
  buildSnapshot: () => T;
};

export type ResolveContextSnapshotCacheResult<T> = {
  snapshot: T;
  cache: ContextCacheMetadata;
};

const sortUnique = (values: string[]): string[] => Array.from(new Set(values.filter((value) => value.length > 0))).sort((left, right) => left.localeCompare(right));

const sha256 = (input: string): string => crypto.createHash('sha256').update(input).digest('hex');

const toIso = (date: Date): string => date.toISOString();

const readIndex = (projectRoot: string): ContextCacheIndexArtifact | null => {
  const indexPath = path.join(projectRoot, CONTEXT_CACHE_INDEX_RELATIVE_PATH);
  if (!fs.existsSync(indexPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(indexPath, 'utf8')) as ContextCacheIndexArtifact;
};

const writeIndex = (projectRoot: string, artifact: ContextCacheIndexArtifact): void => {
  const indexPath = path.join(projectRoot, CONTEXT_CACHE_INDEX_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(indexPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
};

const computeSourceFingerprints = (projectRoot: string, sourceArtifacts: string[]): ContextCacheSourceFingerprint[] =>
  sortUnique(sourceArtifacts).map((artifact) => {
    const absolute = path.join(projectRoot, artifact);
    if (!fs.existsSync(absolute)) {
      return {
        artifact,
        present: false,
        fingerprint: sha256(`${artifact}|missing`)
      };
    }

    const payload = fs.readFileSync(absolute, 'utf8');
    return {
      artifact,
      present: true,
      fingerprint: sha256(payload)
    };
  });

const cacheKeyFor = (scope: ContextCacheScope, shapingLevel: string, riskTier: string): string =>
  sha256(JSON.stringify({ scope, shapingLevel, riskTier })).slice(0, 32);

const defaultSnapshotPath = (cacheKey: string): string => `${CONTEXT_CACHE_SNAPSHOTS_DIR_RELATIVE_PATH}/${cacheKey}.json`;

const fingerprintsEqual = (left: ContextCacheSourceFingerprint[], right: ContextCacheSourceFingerprint[]): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const nowAfter = (leftIso: string, right: Date): boolean => {
  const parsed = Date.parse(leftIso);
  if (Number.isNaN(parsed)) {
    return true;
  }
  return parsed <= right.getTime();
};

export const resolveContextSnapshotCache = <T>(options: ResolveContextSnapshotCacheOptions<T>): ResolveContextSnapshotCacheResult<T> => {
  const now = new Date();
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const sourceFingerprints = computeSourceFingerprints(options.projectRoot, options.sourceArtifacts);
  const cacheKey = cacheKeyFor(options.scope, options.shapingLevel, options.riskTier);
  const index = readIndex(options.projectRoot);
  const existing = index?.entries.find((entry) => entry.cacheKey === cacheKey);

  let invalidationReason: ContextCacheInvalidationReason = 'none';

  if (!existing) {
    invalidationReason = 'cache-miss';
  } else if (
    existing.scope.kind !== options.scope.kind ||
    existing.scope.id !== options.scope.id ||
    existing.shapingLevel !== options.shapingLevel ||
    existing.riskTier !== options.riskTier
  ) {
    invalidationReason = 'cache-key-collision';
  } else if (!fingerprintsEqual(existing.sourceFingerprints, sourceFingerprints)) {
    invalidationReason = 'source-fingerprint-drift';
  } else if (nowAfter(existing.expiresAt, now)) {
    invalidationReason = 'policy-expired';
  } else if (!fs.existsSync(path.join(options.projectRoot, existing.snapshotPath))) {
    invalidationReason = 'snapshot-missing';
  }

  const shouldReuse = invalidationReason === 'none' && existing;

  if (shouldReuse) {
    const snapshot = JSON.parse(fs.readFileSync(path.join(options.projectRoot, existing.snapshotPath), 'utf8')) as T;
    const validatedAt = toIso(now);
    const updatedEntry: ContextCacheIndexEntry = {
      ...existing,
      lastValidatedAt: validatedAt,
      invalidationReason: 'none',
      sourceFingerprints
    };
    const nextEntries = [...(index?.entries ?? []).filter((entry) => entry.cacheKey !== existing.cacheKey), updatedEntry]
      .sort((left, right) => left.cacheKey.localeCompare(right.cacheKey));
    writeIndex(options.projectRoot, {
      schemaVersion: CONTEXT_CACHE_SCHEMA_VERSION,
      kind: 'playbook-context-cache-index',
      generatedAt: validatedAt,
      entries: nextEntries
    });

    return {
      snapshot,
      cache: {
        cacheKey,
        reused: true,
        scope: options.scope,
        shapingLevel: options.shapingLevel,
        riskTier: options.riskTier,
        generatedAt: updatedEntry.generatedAt,
        invalidationReason: 'none',
        sourceFingerprints,
        indexPath: CONTEXT_CACHE_INDEX_RELATIVE_PATH,
        snapshotPath: updatedEntry.snapshotPath,
        expiresAt: updatedEntry.expiresAt
      }
    };
  }

  const snapshot = options.buildSnapshot();
  const generatedAt = toIso(now);
  const expiresAt = toIso(new Date(now.getTime() + maxAgeMs));
  const snapshotPath = existing?.snapshotPath ?? defaultSnapshotPath(cacheKey);
  const snapshotAbsolute = path.join(options.projectRoot, snapshotPath);
  fs.mkdirSync(path.dirname(snapshotAbsolute), { recursive: true });
  fs.writeFileSync(snapshotAbsolute, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

  const entry: ContextCacheIndexEntry = {
    cacheKey,
    scope: options.scope,
    shapingLevel: options.shapingLevel,
    riskTier: options.riskTier,
    generatedAt,
    lastValidatedAt: generatedAt,
    expiresAt,
    invalidationReason,
    sourceFingerprints,
    snapshotPath
  };

  const nextEntries = [...(index?.entries ?? []).filter((candidate) => candidate.cacheKey !== cacheKey), entry]
    .sort((left, right) => left.cacheKey.localeCompare(right.cacheKey));

  writeIndex(options.projectRoot, {
    schemaVersion: CONTEXT_CACHE_SCHEMA_VERSION,
    kind: 'playbook-context-cache-index',
    generatedAt,
    entries: nextEntries
  });

  return {
    snapshot,
    cache: {
      cacheKey,
      reused: false,
      scope: options.scope,
      shapingLevel: options.shapingLevel,
      riskTier: options.riskTier,
      generatedAt,
      invalidationReason,
      sourceFingerprints,
      indexPath: CONTEXT_CACHE_INDEX_RELATIVE_PATH,
      snapshotPath,
      expiresAt
    }
  };
};
