import fs from 'node:fs';
import path from 'node:path';
import {
  getDefaultChangelogConfig,
  mergeChangelogConfig,
  validateChangelogConfig
} from './config.js';
import type {
  ChangelogGeneratorConfig,
  ChangelogValidationDiagnostic
} from './types.js';

export const DEFAULT_CHANGELOG_CONFIG_PATH = '.playbook/changelog-config.json';

export type LoadChangelogConfigOptions = {
  configPath?: string;
  allowMissing?: boolean;
};

export type LoadedChangelogConfig = {
  config: ChangelogGeneratorConfig;
  path: string;
  exists: boolean;
  diagnostics: ChangelogValidationDiagnostic[];
};

const normalizePath = (value: string): string => value.replace(/\\/gu, '/');

const toDisplayPath = (repoRoot: string, absolutePath: string): string => {
  const relativePath = path.relative(repoRoot, absolutePath);
  if (relativePath.length > 0 && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
    return normalizePath(relativePath);
  }

  return normalizePath(absolutePath);
};

const toObject = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

export const loadChangelogConfig = (
  repoRoot: string,
  options: LoadChangelogConfigOptions = {}
): LoadedChangelogConfig => {
  const allowMissing = options.allowMissing ?? true;
  const configPath = options.configPath ?? DEFAULT_CHANGELOG_CONFIG_PATH;
  const absolutePath = path.isAbsolute(configPath)
    ? configPath
    : path.resolve(repoRoot, configPath);
  const displayPath = toDisplayPath(repoRoot, absolutePath);
  const diagnostics: ChangelogValidationDiagnostic[] = [];

  if (!fs.existsSync(absolutePath)) {
    if (!allowMissing) {
      diagnostics.push({
        id: 'changelog.config.file.missing',
        severity: 'error',
        message: `Changelog config file "${displayPath}" was not found.`,
        evidence: displayPath
      });
    }

    return {
      config: getDefaultChangelogConfig(),
      path: displayPath,
      exists: false,
      diagnostics
    };
  }

  let parsedConfig: Partial<ChangelogGeneratorConfig> = {};
  try {
    const parsedValue = JSON.parse(fs.readFileSync(absolutePath, 'utf8')) as unknown;
    const parsedObject = toObject(parsedValue);
    if (!parsedObject) {
      diagnostics.push({
        id: 'changelog.config.file.invalid-shape',
        severity: 'error',
        message: `Changelog config file "${displayPath}" must contain a JSON object.`,
        evidence: displayPath
      });
    } else {
      parsedConfig = parsedObject as Partial<ChangelogGeneratorConfig>;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    diagnostics.push({
      id: 'changelog.config.file.parse-failed',
      severity: 'error',
      message: `Failed to parse changelog config file "${displayPath}".`,
      evidence: message
    });
  }

  const config = mergeChangelogConfig(parsedConfig);
  diagnostics.push(...validateChangelogConfig(config));

  return {
    config,
    path: displayPath,
    exists: true,
    diagnostics
  };
};
