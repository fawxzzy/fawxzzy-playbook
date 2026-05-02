import fs from 'node:fs';
import path from 'node:path';
import {
  buildChangelogEntries,
  classifyChangelogChanges,
  collectGitChangelogChanges,
  loadChangelogConfig,
  mergeChangelogConfig,
  planChangelogAppend,
  renderJsonChangelog,
  renderMarkdownChangelog,
  validateChangelogConfig,
  validateChangelogGeneration
} from '@zachariahredfield/playbook-engine';
import type {
  ChangelogDocument,
  ChangelogEntry,
  ChangelogGeneratorConfig,
  ChangelogValidationDiagnostic,
  ChangelogValidationDiagnosticSeverity
} from '@zachariahredfield/playbook-engine';
import { ExitCode } from '../../lib/cliContract.js';

type ChangelogCommandOptions = {
  format: 'text' | 'json';
  quiet: boolean;
};

type ChangelogSubcommand = 'generate' | 'validate' | 'append';

type ParsedSharedOptions = {
  baseRef?: string;
  headRef: string;
  outputFormat: 'markdown' | 'json';
  configPath?: string;
  outFile?: string;
  includeUnknown?: boolean;
  failOnUnknown?: boolean;
  requireChanges?: boolean;
  lowConfidenceThreshold?: number;
  version?: string;
  date?: string;
};

type GenerateArtifacts = {
  configOverrides: Partial<ChangelogGeneratorConfig>;
  entries: ChangelogEntry[];
  markdown: string;
  json: ChangelogDocument;
  validationDiagnostics: ChangelogValidationDiagnostic[];
};

const printHelp = (): void => {
  console.log(`Usage: playbook changelog <generate|validate|append> [options]

Subcommands:
  generate                   Generate deterministic WHAT/WHY changelog output
  validate                   Validate changelog quality for a git range
  append                     Safely plan or apply changelog insertion

Shared options:
  --base <ref>               Base git ref for range collection (required)
  --head <ref>               Head git ref (default: HEAD)
  --config <path>            Load changelog config from a custom JSON file
  --format <markdown|json>   Output format (default: markdown; --json aliases json)
  --out <path>               Write generated output to a file
  --include-unknown          Force inclusion of unknown-category entries
  --exclude-unknown          Exclude unknown-category entries
  --fail-on-unknown          Fail validation when unknown entries exist
  --require-changes          Fail validation when no entries are generated
  --low-confidence-threshold <0..1>
                             Override the low-confidence validation threshold
  --version <version>        Optional version label for generated output
  --date <YYYY-MM-DD>        Optional date label for generated output
  --help                     Show help

Append options:
  --file <path>              Append target (default: docs/CHANGELOG.md)
  --dry-run                  Print or report the append plan without writing

Examples:
  playbook changelog generate --base HEAD~1 --format markdown
  playbook changelog generate --base HEAD~1 --format json
  playbook changelog validate --base HEAD~1 --json
  playbook changelog append --base HEAD~1 --file docs/CHANGELOG.md --dry-run`);
};

const parseFlag = (allArgs: string[], flag: string): boolean =>
  allArgs.includes(flag);

const parseOptionValue = (
  allArgs: string[],
  name: string
): string | undefined => {
  const index = allArgs.indexOf(name);
  return index >= 0 && allArgs[index + 1]
    ? String(allArgs[index + 1])
    : undefined;
};

const normalizeRelativePath = (value: string): string =>
  value.replace(/\\/gu, '/');

const formatDiagnosticsForText = (
  diagnostics: readonly ChangelogValidationDiagnostic[]
): string[] =>
  diagnostics.map((diagnostic) => {
    const evidence = diagnostic.evidence ? ` (${diagnostic.evidence})` : '';
    const sourceRef = diagnostic.sourceRef ? ` [${diagnostic.sourceRef}]` : '';
    return `- [${diagnostic.severity}] ${diagnostic.id}${sourceRef}: ${diagnostic.message}${evidence}`;
  });

const printJson = (value: unknown): void => {
  console.log(JSON.stringify(value, null, 2));
};

const emitCommandError = (
  options: ChangelogCommandOptions,
  subcommand: string | undefined,
  message: string,
  diagnostics: readonly ChangelogValidationDiagnostic[] = []
): number => {
  if (options.format === 'json') {
    printJson({
      schemaVersion: '1.0',
      command: 'changelog',
      subcommand,
      error: message,
      diagnostics
    });
  } else {
    console.error(message);
  }

  return ExitCode.Failure;
};

const resolveOutputFormat = (
  args: string[],
  globalFormat: 'text' | 'json'
): 'markdown' | 'json' => {
  if (globalFormat === 'json') {
    return 'json';
  }

  return parseOptionValue(args, '--format') === 'json' ? 'json' : 'markdown';
};

const parseLowConfidenceThreshold = (
  args: string[]
): number | undefined | typeof Number.NaN => {
  const raw = parseOptionValue(args, '--low-confidence-threshold');
  if (raw === undefined) {
    return undefined;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const parseSharedOptions = (
  args: string[],
  globalFormat: 'text' | 'json'
): ParsedSharedOptions | string => {
  const includeUnknown = parseFlag(args, '--include-unknown');
  const excludeUnknown = parseFlag(args, '--exclude-unknown');
  if (includeUnknown && excludeUnknown) {
    return 'playbook changelog: --include-unknown and --exclude-unknown cannot be used together.';
  }

  const lowConfidenceThreshold = parseLowConfidenceThreshold(args);
  if (Number.isNaN(lowConfidenceThreshold)) {
    return 'playbook changelog: --low-confidence-threshold must be a finite number between 0 and 1.';
  }

  return {
    baseRef: parseOptionValue(args, '--base'),
    headRef: parseOptionValue(args, '--head') ?? 'HEAD',
    outputFormat: resolveOutputFormat(args, globalFormat),
    configPath: parseOptionValue(args, '--config'),
    outFile: parseOptionValue(args, '--out'),
    includeUnknown: includeUnknown ? true : excludeUnknown ? false : undefined,
    failOnUnknown: parseFlag(args, '--fail-on-unknown') ? true : undefined,
    requireChanges: parseFlag(args, '--require-changes') ? true : undefined,
    lowConfidenceThreshold,
    version: parseOptionValue(args, '--version'),
    date: parseOptionValue(args, '--date')
  };
};

const buildConfigOverrides = (
  shared: ParsedSharedOptions
): Partial<ChangelogGeneratorConfig> => {
  const overrides: Partial<ChangelogGeneratorConfig> = {};

  if (shared.includeUnknown !== undefined) {
    overrides.includeUnknown = shared.includeUnknown;
  }

  if (shared.failOnUnknown !== undefined) {
    overrides.failOnUnknown = shared.failOnUnknown;
  }

  if (shared.requireChanges !== undefined) {
    overrides.requireChanges = shared.requireChanges;
  }

  if (shared.lowConfidenceThreshold !== undefined) {
    overrides.lowConfidenceThreshold = shared.lowConfidenceThreshold;
  }

  return overrides;
};

const severityRank: Record<ChangelogValidationDiagnosticSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2
};

const sortDiagnostics = (
  diagnostics: readonly ChangelogValidationDiagnostic[]
): ChangelogValidationDiagnostic[] =>
  [...diagnostics].sort((left, right) => {
    const severityDiff =
      severityRank[left.severity] - severityRank[right.severity];
    if (severityDiff !== 0) {
      return severityDiff;
    }

    const idDiff = left.id.localeCompare(right.id);
    if (idDiff !== 0) {
      return idDiff;
    }

    return (left.sourceRef ?? '').localeCompare(right.sourceRef ?? '');
  });

const validateOverrides = (
  configOverrides: Partial<ChangelogGeneratorConfig>
): ChangelogValidationDiagnostic[] =>
  validateChangelogConfig(mergeChangelogConfig(configOverrides));

const combineDiagnostics = (
  diagnostics: readonly ChangelogValidationDiagnostic[]
): ChangelogValidationDiagnostic[] => {
  const byKey = new Map<string, ChangelogValidationDiagnostic>();
  for (const diagnostic of diagnostics) {
    const key = [
      diagnostic.id,
      diagnostic.severity,
      diagnostic.message,
      diagnostic.category ?? '',
      diagnostic.sourceRef ?? '',
      diagnostic.evidence ?? ''
    ].join('::');

    if (!byKey.has(key)) {
      byKey.set(key, diagnostic);
    }
  }

  return sortDiagnostics([...byKey.values()]);
};

const ensureBaseRef = (
  baseRef: string | undefined,
  subcommand: ChangelogSubcommand
): string | null => {
  if (baseRef) {
    return baseRef;
  }

  if (subcommand === 'append') {
    return null;
  }

  return null;
};

type ResolvedCommandConfig = {
  config: ChangelogGeneratorConfig;
  diagnostics: ChangelogValidationDiagnostic[];
  path: string;
  exists: boolean;
};

const resolveCommandConfig = (
  cwd: string,
  shared: ParsedSharedOptions
): ResolvedCommandConfig => {
  const loaded = loadChangelogConfig(cwd, {
    configPath: shared.configPath
  });
  const config = mergeChangelogConfig({
    ...loaded.config,
    ...buildConfigOverrides(shared)
  });
  const diagnostics = combineDiagnostics([
    ...loaded.diagnostics,
    ...validateChangelogConfig(config)
  ]);

  return {
    config,
    diagnostics,
    path: loaded.path,
    exists: loaded.exists
  };
};

const generateArtifacts = (
  cwd: string,
  shared: ParsedSharedOptions,
  config: ChangelogGeneratorConfig
): GenerateArtifacts => {
  const rawChanges = collectGitChangelogChanges(cwd, {
    baseRef: shared.baseRef!,
    headRef: shared.headRef
  });
  const classifiedChanges = classifyChangelogChanges(rawChanges, config);
  const entries = buildChangelogEntries(classifiedChanges, config);
  const markdown = renderMarkdownChangelog(entries, {
    configOverrides: config,
    baseRef: shared.baseRef,
    headRef: shared.headRef,
    version: shared.version,
    date: shared.date,
    includeUnknown: shared.includeUnknown
  });
  const json = renderJsonChangelog(entries, {
    configOverrides: config,
    baseRef: shared.baseRef,
    headRef: shared.headRef,
    version: shared.version,
    includeUnknown: shared.includeUnknown
  });
  const validation = validateChangelogGeneration({
    entries,
    classifiedChanges,
    configOverrides: config,
    generatedMarkdown: markdown,
    baseRef: shared.baseRef,
    headRef: shared.headRef
  });

  return {
    configOverrides: config,
    entries,
    markdown,
    json,
    validationDiagnostics: validation.diagnostics
  };
};

const writeFileIfRequested = (cwd: string, outputPath: string, content: string): string => {
  const absolutePath = path.resolve(cwd, outputPath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, 'utf8');
  return absolutePath;
};

const printValidationText = (
  baseRef: string,
  headRef: string,
  diagnostics: readonly ChangelogValidationDiagnostic[],
  status: 'pass' | 'fail'
): void => {
  console.log(`playbook changelog validate: ${status}`);
  console.log(`Range: ${baseRef}..${headRef}`);

  const lines = formatDiagnosticsForText(sortDiagnostics(diagnostics));
  if (lines.length > 0) {
    console.log('Diagnostics:');
    for (const line of lines) {
      console.log(line);
    }
  }
};

const deriveRepoRelativeTarget = (cwd: string, targetFile: string): string => {
  const absoluteTarget = path.resolve(cwd, targetFile);
  const relativeTarget = path.relative(cwd, absoluteTarget);
  if (!relativeTarget.startsWith('..') && !path.isAbsolute(relativeTarget)) {
    return normalizeRelativePath(relativeTarget);
  }

  return normalizeRelativePath(targetFile);
};

const runGenerate = (
  cwd: string,
  shared: ParsedSharedOptions,
  options: ChangelogCommandOptions,
  resolvedConfig: ResolvedCommandConfig
): number => {
  const artifacts = generateArtifacts(cwd, shared, resolvedConfig.config);

  if (shared.outputFormat === 'json') {
    const content = `${JSON.stringify(artifacts.json, null, 2)}\n`;
    if (shared.outFile) {
      writeFileIfRequested(cwd, shared.outFile, content);
      if (!options.quiet) {
        console.log(`Wrote changelog JSON to ${shared.outFile}`);
      }
      return ExitCode.Success;
    }

    printJson(artifacts.json);
    return ExitCode.Success;
  }

  if (shared.outFile) {
    writeFileIfRequested(cwd, shared.outFile, artifacts.markdown);
    if (!options.quiet) {
      console.log(`Wrote changelog Markdown to ${shared.outFile}`);
    }
    return ExitCode.Success;
  }

  process.stdout.write(artifacts.markdown);
  return ExitCode.Success;
};

const runValidate = (
  cwd: string,
  shared: ParsedSharedOptions,
  _options: ChangelogCommandOptions,
  resolvedConfig: ResolvedCommandConfig
): number => {
  const artifacts = generateArtifacts(cwd, shared, resolvedConfig.config);
  const validation = validateChangelogGeneration({
    entries: artifacts.entries,
    configOverrides: artifacts.configOverrides,
    generatedMarkdown: artifacts.markdown,
    baseRef: shared.baseRef,
    headRef: shared.headRef
  });

  if (shared.outputFormat === 'json') {
    printJson(validation);
  } else {
    printValidationText(
      shared.baseRef!,
      shared.headRef,
      validation.diagnostics,
      validation.status
    );
  }

  return validation.status === 'pass'
    ? ExitCode.Success
    : ExitCode.Failure;
};

const runAppend = (
  cwd: string,
  shared: ParsedSharedOptions,
  args: string[],
  _options: ChangelogCommandOptions,
  resolvedConfig: ResolvedCommandConfig
): number => {
  const targetFile = parseOptionValue(args, '--file') ?? resolvedConfig.config.defaultTargetFile;
  const dryRun = parseFlag(args, '--dry-run');
  const artifacts = generateArtifacts(cwd, shared, resolvedConfig.config);
  const absoluteTarget = path.resolve(cwd, targetFile);
  const existingContent = fs.existsSync(absoluteTarget)
    ? fs.readFileSync(absoluteTarget, 'utf8')
    : null;
  const relativeTarget = deriveRepoRelativeTarget(cwd, targetFile);
  const plan = planChangelogAppend({
    existingContent,
    generatedMarkdown: artifacts.markdown,
    targetFile: relativeTarget,
    version: shared.version,
    baseRef: shared.baseRef,
    headRef: shared.headRef,
    date: shared.date
  });

  if (shared.outputFormat === 'json') {
    printJson(plan);
  } else if (dryRun && plan.status === 'planned') {
    process.stdout.write(plan.content.endsWith('\n') ? plan.content : `${plan.content}\n`);
  } else {
    const destination = normalizeRelativePath(targetFile);
    const lines = [
      `playbook changelog append: ${plan.status}`,
      `Target: ${destination}`,
      `Reason: ${plan.reason}`
    ];
    for (const line of lines) {
      console.log(line);
    }

    const diagnosticLines = formatDiagnosticsForText(sortDiagnostics(plan.diagnostics));
    if (diagnosticLines.length > 0) {
      console.log('Diagnostics:');
      for (const line of diagnosticLines) {
        console.log(line);
      }
    }
  }

  if (plan.status === 'blocked') {
    return ExitCode.Failure;
  }

  if (plan.status === 'skipped') {
    return ExitCode.Success;
  }

  if (!dryRun) {
    writeFileIfRequested(cwd, targetFile, plan.content);
  }

  return ExitCode.Success;
};

export const runChangelog = async (
  cwd: string,
  args: string[],
  options: ChangelogCommandOptions
): Promise<number> => {
  const help = parseFlag(args, '--help') || parseFlag(args, '-h');
  const subcommand = args.find((arg) => !arg.startsWith('-')) as
    | ChangelogSubcommand
    | undefined;

  if (!subcommand || help) {
    printHelp();
    return subcommand || help ? ExitCode.Success : ExitCode.Failure;
  }

  if (
    subcommand !== 'generate' &&
    subcommand !== 'validate' &&
    subcommand !== 'append'
  ) {
    return emitCommandError(
      options,
      subcommand,
      'playbook changelog: unsupported subcommand. Use "generate", "validate", or "append".'
    );
  }

  const subcommandIndex = args.indexOf(subcommand);
  const subcommandArgs = subcommandIndex >= 0 ? args.slice(subcommandIndex + 1) : [];
  const shared = parseSharedOptions(subcommandArgs, options.format);
  if (typeof shared === 'string') {
    return emitCommandError(options, subcommand, shared);
  }

  const configDiagnostics = validateOverrides(buildConfigOverrides(shared));
  const resolvedConfig = resolveCommandConfig(cwd, shared);
  const diagnostics = combineDiagnostics([
    ...configDiagnostics,
    ...resolvedConfig.diagnostics
  ]);
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    const message = diagnostics.map((diagnostic) => diagnostic.message).join(' ');
    return emitCommandError(options, subcommand, message, diagnostics);
  }

  if (!ensureBaseRef(shared.baseRef, subcommand)) {
    return emitCommandError(
      options,
      subcommand,
      `playbook changelog ${subcommand}: --base <ref> is required.`
    );
  }

  try {
    if (subcommand === 'generate') {
      return runGenerate(cwd, shared, options, resolvedConfig);
    }

    if (subcommand === 'validate') {
      return runValidate(cwd, shared, options, resolvedConfig);
    }

    return runAppend(cwd, shared, subcommandArgs, options, resolvedConfig);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return emitCommandError(options, subcommand, message);
  }
};
