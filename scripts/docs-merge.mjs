#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const EXCLUDED_DIRS = new Set(['node_modules', 'dist', '.playbook', '.git']);
const DOCS_ROOT = 'docs';
const REPORT_PATH = path.join(DOCS_ROOT, 'REPORT_DOCS_MERGE.md');
const HEADING_NOTE_MARKER = '<!-- docs-merge:canonical-heading -->';
const BLOCK_NOTE_MARKER = '<!-- docs-merge:duplicate-block -->';

function parseArgs(argv) {
  const flags = new Set(argv);
  const apply = flags.has('--apply');
  const prune = flags.has('--prune');
  const dryRun = flags.has('--dry-run') || !apply;
  return { apply, prune, dryRun };
}

function walkMarkdownFiles(rootDir) {
  const files = [];
  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name)) walk(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'REPORT_DOCS_MERGE.md') files.push(fullPath);
    }
  }
  walk(rootDir);
  return files;
}

function normalizeHeading(text) {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function slugify(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function countLine(content, offset) {
  if (offset <= 0) return 1;
  return content.slice(0, offset).split('\n').length;
}

function scanHeadings(content, file) {
  const headings = [];
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  let match;
  while ((match = headingRegex.exec(content)) !== null) {
    headings.push({
      file,
      text: match[2].trim(),
      normalized: normalizeHeading(match[2]),
      start: match.index,
      end: headingRegex.lastIndex,
      line: countLine(content, match.index)
    });
  }
  return headings;
}

function scanBlocks(content, file) {
  const chunks = content.split(/\n{2,}/g);
  const blocks = [];
  let cursor = 0;

  for (const chunk of chunks) {
    if (!chunk) continue;
    const start = content.indexOf(chunk, cursor);
    if (start < 0) continue;
    cursor = start + chunk.length;

    const trimmed = chunk.trim();
    if (!trimmed || trimmed.length < 40) continue;
    if (/^#{1,6}\s+/.test(trimmed) && !trimmed.includes('\n')) continue;

    blocks.push({
      file,
      text: trimmed,
      start,
      end: start + chunk.length,
      line: countLine(content, start)
    });
  }

  return blocks;
}

function toRepoPath(repoRoot, absPath) {
  return path.relative(repoRoot, absPath).split(path.sep).join('/');
}

function buildLink(fromFile, targetFile, anchor) {
  const fromDir = path.dirname(fromFile);
  const rel = path.relative(fromDir, targetFile).split(path.sep).join('/');
  return `${rel}#${anchor}`;
}

function compareOccurrence(a, b) {
  if (a.file !== b.file) return a.file.localeCompare(b.file);
  return a.line - b.line;
}

function detectDuplicates(filesData) {
  const headingMap = new Map();
  const blockMap = new Map();

  for (const data of filesData) {
    for (const heading of data.headings) {
      const key = heading.normalized;
      if (!headingMap.has(key)) headingMap.set(key, []);
      headingMap.get(key).push(heading);
    }
    for (const block of data.blocks) {
      const key = block.text;
      if (!blockMap.has(key)) blockMap.set(key, []);
      blockMap.get(key).push(block);
    }
  }

  const headingDuplicates = [];
  for (const [key, occurrences] of headingMap.entries()) {
    const uniqueFiles = new Set(occurrences.map((item) => item.file));
    if (uniqueFiles.size > 1) {
      occurrences.sort(compareOccurrence);
      headingDuplicates.push({ key, canonical: occurrences[0], occurrences });
    }
  }

  const blockDuplicates = [];
  for (const [key, occurrences] of blockMap.entries()) {
    const uniqueFiles = new Set(occurrences.map((item) => item.file));
    if (uniqueFiles.size > 1) {
      occurrences.sort(compareOccurrence);
      blockDuplicates.push({ key, canonical: occurrences[0], occurrences });
    }
  }

  headingDuplicates.sort((a, b) => a.key.localeCompare(b.key));
  blockDuplicates.sort((a, b) => a.canonical.file.localeCompare(b.canonical.file) || a.canonical.line - b.canonical.line);

  return { headingDuplicates, blockDuplicates };
}

function generateReport({ scannedFiles, headingDuplicates, blockDuplicates, options }) {
  const lines = [];
  lines.push('# Docs Merge Report');
  lines.push('');
  lines.push(`- Mode: ${options.apply ? 'APPLY' : 'DRY-RUN'}`);
  lines.push(`- Prune: ${options.prune ? 'enabled' : 'disabled'}`);
  lines.push(`- Files scanned: ${scannedFiles.length}`);
  lines.push(`- Duplicate headings: ${headingDuplicates.length}`);
  lines.push(`- Duplicate blocks: ${blockDuplicates.length}`);
  lines.push('');

  lines.push('## Files Scanned');
  lines.push('');
  for (const file of scannedFiles) lines.push(`- \`${file}\``);
  lines.push('');

  lines.push('## Duplicate Headings');
  lines.push('');
  if (headingDuplicates.length === 0) {
    lines.push('_None_');
  } else {
    for (const dup of headingDuplicates) {
      const canonical = dup.canonical;
      lines.push(`### ${canonical.text}`);
      lines.push(`- Canonical: \`${canonical.file}:${canonical.line}\``);
      lines.push('- Duplicates:');
      for (const occ of dup.occurrences.slice(1)) {
        lines.push(`  - \`${occ.file}:${occ.line}\` -> add canonical heading pointer`);
      }
      lines.push('');
    }
  }
  lines.push('');

  lines.push('## Duplicate Blocks');
  lines.push('');
  if (blockDuplicates.length === 0) {
    lines.push('_None_');
  } else {
    for (let i = 0; i < blockDuplicates.length; i += 1) {
      const dup = blockDuplicates[i];
      const canonical = dup.canonical;
      lines.push(`### Block ${i + 1}`);
      lines.push(`- Canonical: \`${canonical.file}:${canonical.line}\``);
      lines.push(`- Fingerprint: \`${canonical.text.slice(0, 72).replace(/`/g, '\\`')}\`${canonical.text.length > 72 ? '…' : ''}`);
      lines.push('- Duplicates:');
      for (const occ of dup.occurrences.slice(1)) {
        const action = options.prune
          ? 'replace block with canonical stub + link'
          : 'append see-also pointer next to duplicate block';
        lines.push(`  - \`${occ.file}:${occ.line}\` -> ${action}`);
      }
      lines.push('');
    }
  }

  lines.push('## Proposed Actions');
  lines.push('');
  lines.push('- Add canonical heading links for repeated headings in non-canonical files.');
  lines.push('- Add see-also pointers for exact duplicate blocks.');
  if (options.prune) {
    lines.push('- Prune exact duplicate blocks in non-canonical files with a safe canonical stub.');
  } else {
    lines.push('- Keep all content (SAFE mode default): no duplicate content removals.');
  }

  return `${lines.join('\n')}\n`;
}

function applySafeEdits(filesData, duplicates, options) {
  const perFileEdits = new Map();

  const queueEdit = (file, edit) => {
    if (!perFileEdits.has(file)) perFileEdits.set(file, []);
    perFileEdits.get(file).push(edit);
  };

  for (const dup of duplicates.headingDuplicates) {
    const canonical = dup.canonical;
    const anchor = slugify(canonical.text);
    for (const occ of dup.occurrences.slice(1)) {
      const fileData = filesData.find((entry) => entry.file === occ.file);
      if (!fileData || fileData.content.includes(HEADING_NOTE_MARKER)) continue;
      const link = buildLink(occ.file, canonical.file, anchor);
      const insertion = `\n${HEADING_NOTE_MARKER}\n> **Docs merge note:** Canonical section lives at [${canonical.text}](${link}).\n`;
      queueEdit(occ.file, { type: 'insert', at: occ.end, text: insertion });
    }
  }

  for (const dup of duplicates.blockDuplicates) {
    const canonical = dup.canonical;
    for (const occ of dup.occurrences.slice(1)) {
      const fileData = filesData.find((entry) => entry.file === occ.file);
      if (!fileData || fileData.content.includes(BLOCK_NOTE_MARKER)) continue;
      const link = buildLink(occ.file, canonical.file, `block-${canonical.line}`);
      if (options.prune) {
        const replacement = `${BLOCK_NOTE_MARKER}\n> **Docs merge note:** Duplicate block moved to canonical source: [${canonical.file}:${canonical.line}](${link}).`;
        queueEdit(occ.file, { type: 'replace', start: occ.start, end: occ.end, text: replacement });
      } else {
        const insertion = `\n\n${BLOCK_NOTE_MARKER}\n> See also canonical block: [${canonical.file}:${canonical.line}](${link}).`;
        queueEdit(occ.file, { type: 'insert', at: occ.end, text: insertion });
      }
    }
  }

  const updatedFiles = [];
  for (const [file, edits] of perFileEdits.entries()) {
    const fileData = filesData.find((entry) => entry.file === file);
    if (!fileData) continue;
    edits.sort((a, b) => {
      const aPos = a.type === 'replace' ? a.start : a.at;
      const bPos = b.type === 'replace' ? b.start : b.at;
      return bPos - aPos;
    });

    let nextContent = fileData.content;
    for (const edit of edits) {
      if (edit.type === 'replace') {
        nextContent = `${nextContent.slice(0, edit.start)}${edit.text}${nextContent.slice(edit.end)}`;
      } else {
        nextContent = `${nextContent.slice(0, edit.at)}${edit.text}${nextContent.slice(edit.at)}`;
      }
    }

    if (nextContent !== fileData.content) {
      fs.writeFileSync(path.resolve(file), nextContent);
      updatedFiles.push(file);
    }
  }

  return updatedFiles;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const docsRootAbs = path.resolve(DOCS_ROOT);

  if (!fs.existsSync(docsRootAbs)) {
    throw new Error(`Missing docs directory at ${docsRootAbs}`);
  }

  const markdownFilesAbs = walkMarkdownFiles(docsRootAbs);
  const markdownFiles = markdownFilesAbs.map((file) => toRepoPath(process.cwd(), file));

  const filesData = markdownFiles.map((relPath) => {
    const content = fs.readFileSync(path.resolve(relPath), 'utf8');
    return {
      file: relPath,
      content,
      headings: scanHeadings(content, relPath),
      blocks: scanBlocks(content, relPath)
    };
  });

  const duplicates = detectDuplicates(filesData);

  const report = generateReport({
    scannedFiles: markdownFiles,
    headingDuplicates: duplicates.headingDuplicates,
    blockDuplicates: duplicates.blockDuplicates,
    options
  });

  fs.writeFileSync(path.resolve(REPORT_PATH), report);

  let updatedFiles = [];
  if (options.apply) {
    updatedFiles = applySafeEdits(filesData, duplicates, options);
  }

  console.log(`docs-merge: scanned=${markdownFiles.length} heading-duplicates=${duplicates.headingDuplicates.length} block-duplicates=${duplicates.blockDuplicates.length}`);
  console.log(`docs-merge: report=${REPORT_PATH}`);
  if (options.apply) {
    console.log(`docs-merge: updated files=${updatedFiles.length}`);
    for (const file of updatedFiles) console.log(` - ${file}`);
  } else {
    console.log('docs-merge: dry-run only (no file edits applied)');
  }
}

main();
