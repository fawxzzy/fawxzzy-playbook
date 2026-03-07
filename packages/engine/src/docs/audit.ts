import fs from 'node:fs';
import path from 'node:path';

export type DocsAuditLevel = 'error' | 'warning';
export type DocsAuditStatus = 'pass' | 'warn' | 'fail';

export type DocsAuditFinding = {
  ruleId: string;
  level: DocsAuditLevel;
  message: string;
  path: string;
  suggestedDestination?: string;
  recommendation?: 'historical keep' | 'merge into workflow' | 'archive' | 'delete after migration';
};

export type DocsAuditResult = {
  ok: boolean;
  status: DocsAuditStatus;
  summary: {
    errors: number;
    warnings: number;
    checksRun: number;
  };
  findings: DocsAuditFinding[];
};

const REQUIRED_ANCHORS = [
  'docs/PLAYBOOK_PRODUCT_ROADMAP.md',
  'docs/PLAYBOOK_IMPROVEMENTS.md',
  'docs/PLAYBOOK_NOTES.md',
  'docs/ARCHITECTURE.md',
  'docs/PLAYBOOK_DEV_WORKFLOW.md',
  'docs/index.md',
  'docs/archive/'
] as const;

const PLANNING_ALLOWED_PATHS = new Set(['docs/PLAYBOOK_IMPROVEMENTS.md', 'docs/PLAYBOOK_PRODUCT_ROADMAP.md']);
const IDEA_LEAKAGE_SCAN_PATHS = ['docs/AI_AGENT_CONTEXT.md', 'docs/PLAYBOOK_DEV_WORKFLOW.md', 'docs/index.md', 'AGENTS.md'] as const;
const IDEA_LEAKAGE_PATTERN =
  /\b(roadmap|backlog|future\s+(?:feature|features|plan|plans|work)|upcoming|planned|next\s+up|improvement\s+ideas?|migration\s+tracker|cleanup\s+tracker)\b/i;

const RESPONSIBILITY_BOUNDARY_RULES: Array<{ path: string; forbiddenHeadingMarkers: string[] }> = [
  { path: 'docs/PLAYBOOK_PRODUCT_ROADMAP.md', forbiddenHeadingMarkers: ['improvements backlog', 'development workflow', 'system architecture'] },
  { path: 'docs/PLAYBOOK_IMPROVEMENTS.md', forbiddenHeadingMarkers: ['strategic roadmap', 'development workflow', 'system architecture'] },
  { path: 'docs/PLAYBOOK_NOTES.md', forbiddenHeadingMarkers: ['strategic roadmap', 'improvements backlog'] },
  { path: 'docs/ARCHITECTURE.md', forbiddenHeadingMarkers: ['strategic roadmap', 'improvements backlog', 'development workflow'] },
  { path: 'docs/PLAYBOOK_DEV_WORKFLOW.md', forbiddenHeadingMarkers: ['strategic roadmap', 'improvements backlog', 'system architecture'] },
  { path: 'docs/AI_AGENT_CONTEXT.md', forbiddenHeadingMarkers: ['strategic roadmap', 'improvements backlog'] },
  { path: 'AGENTS.md', forbiddenHeadingMarkers: ['strategic roadmap', 'improvements backlog'] }
];

const CLEANUP_CANDIDATE_PATTERN = /(?:UPDATE_ROADMAP|DOCS_MERGE|CONSOLIDATION|CLEANUP|MIGRATION|TRACKER)/i;

const normalizeHeading = (heading: string): string =>
  heading
    .trim()
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/\s+/g, ' ');

const extractHeadings = (content: string): string[] => {
  const headings: string[] = [];
  for (const line of content.split(/\r?\n/u)) {
    const match = /^#{1,6}\s+(.+?)\s*$/u.exec(line);
    if (match) {
      headings.push(match[1]);
    }
  }

  return headings;
};

const readTextIfExists = (repoRoot: string, relativePath: string): string | null => {
  const filePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return fs.readFileSync(filePath, 'utf8');
};

const listDocsTopLevelMarkdown = (repoRoot: string): string[] => {
  const docsPath = path.join(repoRoot, 'docs');
  if (!fs.existsSync(docsPath)) {
    return [];
  }

  return fs
    .readdirSync(docsPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
    .map((entry) => `docs/${entry.name}`)
    .sort();
};

const listArchiveEntries = (repoRoot: string): string[] => {
  const archivePath = path.join(repoRoot, 'docs', 'archive');
  if (!fs.existsSync(archivePath)) {
    return [];
  }

  return fs
    .readdirSync(archivePath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `docs/archive/${entry.name}`)
    .sort();
};

export const runDocsAudit = (repoRoot: string): DocsAuditResult => {
  const findings: DocsAuditFinding[] = [];

  for (const requiredPath of REQUIRED_ANCHORS) {
    const absolutePath = path.join(repoRoot, requiredPath);
    const exists = requiredPath.endsWith('/') ? fs.existsSync(absolutePath) && fs.statSync(absolutePath).isDirectory() : fs.existsSync(absolutePath);

    if (!exists) {
      findings.push({
        ruleId: 'docs.required-anchor.missing',
        level: 'error',
        message: 'Required documentation anchor is missing.',
        path: requiredPath
      });
    }
  }

  const topLevelDocs = listDocsTopLevelMarkdown(repoRoot);
  const duplicateRoadmapCandidates = new Set(['docs/ROADMAP.md', 'docs/PRODUCT_ROADMAP.md', 'docs/PLAYBOOK_ROADMAP.md']);
  const duplicateRoadmapPaths = topLevelDocs.filter((relativePath) => duplicateRoadmapCandidates.has(relativePath));

  for (const duplicatePath of duplicateRoadmapPaths) {
    findings.push({
      ruleId: 'docs.single-roadmap.duplicate',
      level: 'error',
      message: 'Duplicate strategic roadmap document detected. Keep a single strategic roadmap.',
      path: duplicatePath,
      suggestedDestination: 'docs/PLAYBOOK_PRODUCT_ROADMAP.md'
    });
  }

  for (const relativePath of IDEA_LEAKAGE_SCAN_PATHS) {
    const content = readTextIfExists(repoRoot, relativePath);
    if (!content) {
      continue;
    }

    if (PLANNING_ALLOWED_PATHS.has(relativePath) || relativePath.startsWith('docs/archive/')) {
      continue;
    }

    if (IDEA_LEAKAGE_PATTERN.test(content)) {
      findings.push({
        ruleId: 'docs.idea-leakage.detected',
        level: 'warning',
        message: 'Planning language detected outside approved planning surfaces.',
        path: relativePath,
        suggestedDestination: 'docs/PLAYBOOK_IMPROVEMENTS.md'
      });
    }
  }

  for (const rule of RESPONSIBILITY_BOUNDARY_RULES) {
    const content = readTextIfExists(repoRoot, rule.path);
    if (!content) {
      continue;
    }

    const headings = extractHeadings(content);
    for (const heading of headings) {
      const normalized = normalizeHeading(heading);
      const overlapMarker = rule.forbiddenHeadingMarkers.find((marker) => normalized.includes(marker));
      if (!overlapMarker) {
        continue;
      }

      findings.push({
        ruleId: 'docs.responsibility-boundary.heading-overlap',
        level: 'warning',
        message: `Heading "${heading}" suggests overlap with another documentation responsibility.`,
        path: rule.path
      });
    }
  }

  const planningDocs = ['docs/PLAYBOOK_PRODUCT_ROADMAP.md', 'docs/PLAYBOOK_IMPROVEMENTS.md', 'docs/PLAYBOOK_NOTES.md'] as const;
  const headingIndex = new Map<string, string>();

  for (const planningDoc of planningDocs) {
    const content = readTextIfExists(repoRoot, planningDoc);
    if (!content) {
      continue;
    }

    const headings = extractHeadings(content);
    for (const heading of headings) {
      const normalized = normalizeHeading(heading);
      const existingPath = headingIndex.get(normalized);
      if (!existingPath) {
        headingIndex.set(normalized, planningDoc);
        continue;
      }

      if (existingPath !== planningDoc) {
        findings.push({
          ruleId: 'docs.responsibility-boundary.duplicate-heading',
          level: 'warning',
          message: `Heading "${heading}" is duplicated across planning docs (${existingPath} and ${planningDoc}).`,
          path: planningDoc
        });
      }
    }
  }

  const archiveEntries = listArchiveEntries(repoRoot);
  const archiveNamingPattern = /^docs\/archive\/PLAYBOOK_IMPROVEMENTS_\d{4}(?:-\d{2})?\.md$/u;

  for (const archiveEntry of archiveEntries) {
    if (!archiveEntry.toLowerCase().endsWith('.md')) {
      continue;
    }

    if (!archiveNamingPattern.test(archiveEntry)) {
      findings.push({
        ruleId: 'docs.backlog-hygiene.archive-name',
        level: 'warning',
        message: 'Archive file name does not match the expected convention PLAYBOOK_IMPROVEMENTS_<YYYY>.md.',
        path: archiveEntry
      });
    }
  }

  const improvementsDoc = readTextIfExists(repoRoot, 'docs/PLAYBOOK_IMPROVEMENTS.md');
  if (improvementsDoc && !/archive/i.test(improvementsDoc)) {
    findings.push({
      ruleId: 'docs.backlog-hygiene.guidance-missing',
      level: 'warning',
      message: 'Improvements backlog should reference how completed/stale items are archived.',
      path: 'docs/PLAYBOOK_IMPROVEMENTS.md',
      suggestedDestination: 'docs/archive/'
    });
  }

  const cleanupCandidates = topLevelDocs.filter((relativePath) => CLEANUP_CANDIDATE_PATTERN.test(path.basename(relativePath)));
  for (const candidatePath of cleanupCandidates) {
    let recommendation: DocsAuditFinding['recommendation'];

    if (/^docs\/REPORT_/iu.test(candidatePath)) {
      recommendation = 'historical keep';
    } else if (/UPDATE/iu.test(candidatePath)) {
      recommendation = 'delete after migration';
    } else if (/MERGE|CONSOLIDATION/iu.test(candidatePath)) {
      recommendation = 'archive';
    } else {
      recommendation = 'merge into workflow';
    }

    findings.push({
      ruleId: 'docs.cleanup-dedupe.candidate',
      level: 'warning',
      message: `One-off documentation cleanup/migration tracker detected (${recommendation}).`,
      path: candidatePath,
      recommendation
    });
  }

  const errors = findings.filter((finding) => finding.level === 'error').length;
  const warnings = findings.filter((finding) => finding.level === 'warning').length;

  return {
    ok: errors === 0,
    status: errors > 0 ? 'fail' : warnings > 0 ? 'warn' : 'pass',
    summary: {
      errors,
      warnings,
      checksRun: 6
    },
    findings
  };
};
