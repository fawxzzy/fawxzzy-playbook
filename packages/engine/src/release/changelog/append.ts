import { mergeChangelogConfig } from './config.js';
import type { ChangelogValidationDiagnostic } from './types.js';

export type PlanChangelogAppendInput = {
  existingContent?: string | null;
  generatedMarkdown: string;
  targetFile?: string;
  version?: string;
  baseRef?: string;
  headRef?: string;
  date?: string;
  allowManagedChangelogTarget?: boolean;
};

export type ChangelogAppendPlan = {
  status: 'planned' | 'skipped' | 'blocked';
  reason: string;
  content: string;
  duplicateDetected: boolean;
  targetFile: string;
  diagnostics: ChangelogValidationDiagnostic[];
};

const CHANGELOG_MANAGED_START = '<!-- PLAYBOOK:CHANGELOG_RELEASE_NOTES_START -->';
const CHANGELOG_MANAGED_END = '<!-- PLAYBOOK:CHANGELOG_RELEASE_NOTES_END -->';
const GENERATED_SECTION_START = '<!-- PLAYBOOK:GENERATED_CHANGELOG_START -->';
const GENERATED_SECTION_END = '<!-- PLAYBOOK:GENERATED_CHANGELOG_END -->';

const normalizeLineEndings = (value: string): string => value.replace(/\r\n/gu, '\n');

const trimTrailingWhitespace = (value: string): string => value.replace(/\s+$/u, '');

const normalizeGeneratedMarkdown = (value: string): string => {
  const trimmed = trimTrailingWhitespace(normalizeLineEndings(value).trim());
  const lines = trimmed.split('\n');
  if (/^#\s+/u.test(lines[0] ?? '')) {
    lines.shift();
    while (lines[0] === '') {
      lines.shift();
    }
  }

  return lines.join('\n').trim();
};

const buildGeneratedMarker = (input: PlanChangelogAppendInput): string => {
  const attributes = [
    input.baseRef ? `base=${input.baseRef}` : null,
    input.headRef ? `head=${input.headRef}` : null,
    input.version ? `version=${input.version}` : null,
    input.date ? `date=${input.date}` : null
  ].filter((value): value is string => value !== null);

  return attributes.length > 0
    ? `<!-- PLAYBOOK:CHANGELOG_GENERATED ${attributes.join(' ')} -->`
    : '<!-- PLAYBOOK:CHANGELOG_GENERATED -->';
};

const buildGeneratedSection = (input: PlanChangelogAppendInput, generatedMarkdown: string): string => {
  const body = trimTrailingWhitespace(generatedMarkdown);
  return `${buildGeneratedMarker(input)}\n${body}`;
};

const buildDuplicateHints = (input: PlanChangelogAppendInput, marker: string): string[] => {
  const hints = [marker];

  if (input.version) {
    hints.push(`## ${input.version}`);
  }

  return hints;
};

const containsManagedMarkers = (content: string): boolean =>
  content.includes(CHANGELOG_MANAGED_START) && content.includes(CHANGELOG_MANAGED_END);

const findMarkerRange = (
  content: string,
  startMarker: string,
  endMarker: string
): { startIndex: number; endIndex: number } | null => {
  const startIndex = content.indexOf(startMarker);
  const endIndex = startIndex >= 0 ? content.indexOf(endMarker, startIndex + startMarker.length) : -1;

  if (startIndex < 0 && endIndex < 0) {
    return null;
  }

  if (startIndex < 0 || endIndex < 0 || endIndex < startIndex) {
    return {
      startIndex,
      endIndex
    };
  }

  return {
    startIndex,
    endIndex: endIndex + endMarker.length
  };
};

const rangesOverlap = (
  left: { startIndex: number; endIndex: number },
  right: { startIndex: number; endIndex: number }
): boolean => left.startIndex < right.endIndex && right.startIndex < left.endIndex;

const buildGeneratedSeamSection = (generatedSection: string): string =>
  `${GENERATED_SECTION_START}\n${generatedSection}\n${GENERATED_SECTION_END}`;

const buildBlockedPlan = (
  reason: string,
  targetFile: string,
  existingContent: string,
  diagnostics: ChangelogValidationDiagnostic[]
): ChangelogAppendPlan => ({
  status: 'blocked',
  reason,
  content: existingContent,
  duplicateDetected: false,
  targetFile,
  diagnostics
});

const buildSkippedPlan = (
  reason: string,
  targetFile: string,
  content: string,
  diagnostics: ChangelogValidationDiagnostic[]
): ChangelogAppendPlan => ({
  status: 'skipped',
  reason,
  content,
  duplicateDetected: true,
  targetFile,
  diagnostics
});

const buildPlannedPlan = (
  reason: string,
  targetFile: string,
  content: string,
  diagnostics: ChangelogValidationDiagnostic[]
): ChangelogAppendPlan => ({
  status: 'planned',
  reason,
  content,
  duplicateDetected: false,
  targetFile,
  diagnostics
});

export const planChangelogAppend = (input: PlanChangelogAppendInput): ChangelogAppendPlan => {
  const config = mergeChangelogConfig();
  const targetFile = input.targetFile ?? config.defaultTargetFile;
  const existingContent = normalizeLineEndings(input.existingContent ?? '');
  const generatedMarkdown = normalizeGeneratedMarkdown(input.generatedMarkdown);
  const diagnostics: ChangelogValidationDiagnostic[] = [];

  if (generatedMarkdown.length === 0) {
    diagnostics.push({
      id: 'changelog.append.generated-markdown.empty',
      severity: 'error',
      message: 'Generated changelog markdown is empty.',
      evidence: `targetFile=${targetFile}`
    });

    return buildBlockedPlan('Generated markdown is empty.', targetFile, existingContent, diagnostics);
  }

  const marker = buildGeneratedMarker(input);
  const duplicateHints = buildDuplicateHints(input, marker);
  const duplicateDetected = duplicateHints.some((hint) => existingContent.includes(hint));
  if (duplicateDetected) {
    diagnostics.push({
      id: 'changelog.append.duplicate-detected',
      severity: 'info',
      message: 'Matching changelog content already exists for the requested version or range.',
      evidence: duplicateHints.join(' | ')
    });

    return buildSkippedPlan('Matching changelog content already exists.', targetFile, existingContent, diagnostics);
  }

  const generatedSection = buildGeneratedSection(input, generatedMarkdown);
  const generatedSeamRange = findMarkerRange(existingContent, GENERATED_SECTION_START, GENERATED_SECTION_END);
  if (generatedSeamRange && (generatedSeamRange.startIndex < 0 || generatedSeamRange.endIndex < 0)) {
    diagnostics.push({
      id: 'changelog.append.generated-seam.malformed',
      severity: 'error',
      message: 'Generated changelog seam markers are malformed.',
      evidence: targetFile
    });

    return buildBlockedPlan('Generated changelog seam markers are malformed.', targetFile, existingContent, diagnostics);
  }

  if (existingContent.length === 0) {
    const content = `${config.markdownHeading}\n\n${generatedSection}\n`;
    return buildPlannedPlan('Created a new changelog document.', targetFile, content, diagnostics);
  }

  if (generatedSeamRange && generatedSeamRange.startIndex >= 0 && generatedSeamRange.endIndex >= 0) {
    const managedRange = findMarkerRange(existingContent, CHANGELOG_MANAGED_START, CHANGELOG_MANAGED_END);
    if (managedRange && managedRange.startIndex >= 0 && managedRange.endIndex >= 0 && rangesOverlap(generatedSeamRange, managedRange)) {
      diagnostics.push({
        id: 'changelog.append.generated-seam.overlaps-managed-block',
        severity: 'error',
        message: 'Generated changelog seam overlaps the Playbook-managed release notes block.',
        evidence: targetFile
      });

      return buildBlockedPlan(
        'Generated changelog seam overlaps the managed release-notes block.',
        targetFile,
        existingContent,
        diagnostics
      );
    }

    const before = trimTrailingWhitespace(existingContent.slice(0, generatedSeamRange.startIndex));
    const after = existingContent.slice(generatedSeamRange.endIndex).replace(/^\n*/u, '');
    const seamSection = buildGeneratedSeamSection(generatedSection);
    const content = after.length > 0
      ? `${before}\n\n${seamSection}\n\n${after}`
      : `${before}\n\n${seamSection}\n`;

    return buildPlannedPlan('Replaced the generated changelog seam content.', targetFile, content, diagnostics);
  }

  if (targetFile === 'docs/CHANGELOG.md' && containsManagedMarkers(existingContent)) {
    diagnostics.push({
      id: 'changelog.append.target.managed',
      severity: 'error',
      message: 'docs/CHANGELOG.md contains Playbook-managed release notes; choose a safe generated section seam or use a non-managed target.',
      evidence: targetFile
    });

    return buildBlockedPlan(
      'Managed changelog target is ambiguous without a generated changelog seam.',
      targetFile,
      existingContent,
      diagnostics
    );
  }

  const headingMatch = /^(#\s+Changelog[^\n]*)(\n|$)/u.exec(existingContent);
  if (headingMatch) {
    const heading = headingMatch[1];
    const remainder = existingContent.slice(heading.length).replace(/^\n*/u, '');
    const content =
      remainder.length > 0
        ? `${heading}\n\n${generatedSection}\n\n${trimTrailingWhitespace(remainder)}\n`
        : `${heading}\n\n${generatedSection}\n`;

    return buildPlannedPlan('Inserted generated content below the top-level changelog heading.', targetFile, content, diagnostics);
  }

  const content = `${trimTrailingWhitespace(existingContent)}\n\n${generatedSection}\n`;
  return buildPlannedPlan('Appended generated content to the existing changelog document.', targetFile, content, diagnostics);
};
