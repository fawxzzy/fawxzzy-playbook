import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const Ajv = require('ajv');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');

const schemaPath = path.join(repoRoot, 'exports', 'playbook.contract.schema.v1.json');
const examplePath = path.join(repoRoot, 'exports', 'playbook.contract.example.v1.json');
const contractDocPath = path.join(repoRoot, 'docs', 'contracts', 'PLAYBOOK-CONTRACT.md');

const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const example = JSON.parse(fs.readFileSync(examplePath, 'utf8')) as {
  canonical_principles: Array<{ id: string }>;
  patterns: Array<{ id: string }>;
  continuity_requirements: {
    raw_transcript_role: string;
    raw_transcript_is_primary_memory: boolean;
    structured_handoff_required: boolean;
    promotion_targets: string[];
  };
  adoption_checks: Array<{ id: string }>;
  verification_hooks: Array<{ id: string }>;
  anti_patterns: string[];
};

describe('playbook contract export', () => {
  it('validates the example export against the published schema', () => {
    const ajv = new Ajv({ allErrors: true, schemaId: 'auto' });
    const validate = ajv.compile(schema);
    const valid = validate(example);

    expect(valid, JSON.stringify(validate.errors, null, 2)).toBe(true);
  });

  it('uses unique ids across principles, patterns, adoption checks, and verification hooks', () => {
    const allIds = [
      ...example.canonical_principles.map((entry) => entry.id),
      ...example.patterns.map((entry) => entry.id),
      ...example.adoption_checks.map((entry) => entry.id),
      ...example.verification_hooks.map((entry) => entry.id)
    ];
    const uniqueIds = new Set(allIds);

    expect(uniqueIds.size).toBe(allIds.length);
  });

  it('keeps the required continuity layers explicit', () => {
    expect(example.continuity_requirements.raw_transcript_role).toBe('trace_only');
    expect(example.continuity_requirements.raw_transcript_is_primary_memory).toBe(false);
    expect(example.continuity_requirements.structured_handoff_required).toBe(true);
    expect(example.continuity_requirements.promotion_targets).toEqual(
      expect.arrayContaining(['initiative', 'working_memory', 'plan', 'knowledge', 'receipt'])
    );
  });

  it('rejects transcript-as-memory and duplicate-truth shortcuts in the export and contract doc', () => {
    expect(example.anti_patterns).toEqual(
      expect.arrayContaining(['transcript_as_primary_memory', 'duplicate_truth_store_for_owner_content'])
    );

    const contractDoc = fs.readFileSync(contractDocPath, 'utf8');
    expect(contractDoc).toContain('Owner repos keep owner truth');
    expect(contractDoc).toContain('raw chat transcripts as canonical memory');
    expect(contractDoc).toContain('second canonical store');
  });
});
